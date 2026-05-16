import { Router } from 'express';
import { withTransaction, query } from '../db.js';
import { audit } from '../audit.js';
import { pageRange, pageResult } from '../pagination.js';

export const paymentsRouter = Router();

paymentsRouter.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, limit, offset } = pageRange(req);
    const result = await query(`
      select p.*
      from payments p
      join purchase_invoices pi on pi.id = p.invoice_id
      where pi.restaurant_id = $1
      order by p.date_paid desc, p.id desc
      limit $2 offset $3
    `, [req.restaurantId, limit, offset]);
    const count = await query(`
      select count(*)
      from payments p
      join purchase_invoices pi on pi.id = p.invoice_id
      where pi.restaurant_id = $1
    `, [req.restaurantId]);
    res.json(pageResult(result.rows, count.rows[0].count, page, pageSize));
  } catch (error) {
    next(error);
  }
});

paymentsRouter.post('/batch', async (req, res, next) => {
  try {
    const payload = req.body;
    const saved = await withTransaction(async client => {
      let remaining = typeof payload.amount === 'number' ? payload.amount : null;
      if (remaining !== null && (!Number.isFinite(remaining) || remaining < 0)) {
        const error = new Error('O valor do pagamento tem de ser positivo.');
        error.status = 400;
        throw error;
      }

      const invoiceIds = payload.invoiceIds || [];
      if (remaining !== null && invoiceIds.length > 0) {
        const dueRows = await client.query(`
          select id, greatest(total_amount - paid_amount, 0) as due
          from purchase_invoices
          where id = any($1::uuid[]) and restaurant_id = $2 and status <> 'PAGO'
          for update
        `, [invoiceIds, req.restaurantId]);
        const totalDue = dueRows.rows.reduce((sum, row) => sum + Number(row.due || 0), 0);
        if (remaining > totalDue + 0.0001) {
          const error = new Error(`O pagamento (€ ${remaining.toFixed(2)}) excede o valor em dívida (€ ${totalDue.toFixed(2)}).`);
          error.status = 400;
          throw error;
        }
      }
      const payments = [];

      for (const invoiceId of invoiceIds) {
        const before = await client.query('select * from purchase_invoices where id = $1 and restaurant_id = $2 for update', [invoiceId, req.restaurantId]);
        const invoice = before.rows[0];
        if (!invoice || invoice.status === 'PAGO') continue;
        if (invoice.is_missing_pages) {
          const error = new Error(`A fatura ${invoice.doc_number || invoiceId} tem páginas em falta e não pode ser paga.`);
          error.status = 409;
          throw error;
        }
        if (invoice.document_type === 'NC') {
          const error = new Error(`A nota de crédito ${invoice.doc_number || invoiceId} não pode ser liquidada como pagamento.`);
          error.status = 409;
          throw error;
        }

        const due = Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount || 0));
        const payThis = remaining === null ? due : Math.min(due, Math.max(0, remaining));
        if (remaining !== null) remaining = Math.max(0, remaining - payThis);
        if (payThis <= 0) continue;

        const payment = await client.query(`
          insert into payments (invoice_id, supplier_id, amount, date_paid, method, account, notes, proof_url, archive_document_id)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          returning *
        `, [
          invoiceId,
          invoice.supplier_id,
          payThis,
          payload.datePaid,
          payload.method,
          payload.account,
          payload.notes,
          payload.proofUrl,
          payload.archiveDocumentId
        ]);

        const newPaid = Number(invoice.paid_amount || 0) + payThis;
        const status = newPaid >= Number(invoice.total_amount) ? 'PAGO' : 'PARCIAL';
        const after = await client.query(`
          update purchase_invoices
          set paid_amount = $1, status = $2, last_payment_date = $3, last_payment_method = $4, last_payment_account = $5
          where id = $6
          returning *
        `, [newPaid, status, payload.datePaid, payload.method, payload.account, invoiceId]);

        await audit(client, req, 'create', 'payments', payment.rows[0].id, null, payment.rows[0]);
        await audit(client, req, 'update_payment_status', 'purchase_invoices', invoiceId, invoice, after.rows[0]);
        payments.push(payment.rows[0]);
      }

      return payments;
    });
    res.status(201).json({ data: saved });
  } catch (error) {
    next(error);
  }
});
