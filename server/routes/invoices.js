import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { pageRange, pageResult } from '../pagination.js';

export const invoicesRouter = Router();

invoicesRouter.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, limit, offset } = pageRange(req);
    const result = await query(`
      select *
      from purchase_invoices
      order by date_issued desc, id desc
      limit $1 offset $2
    `, [limit, offset]);
    const count = await query('select count(*) from purchase_invoices');
    res.json(pageResult(result.rows, count.rows[0].count, page, pageSize));
  } catch (error) {
    next(error);
  }
});

invoicesRouter.get('/:id/lines', async (req, res, next) => {
  try {
    const result = await query(`
      select *
      from purchase_invoice_lines
      where invoice_id = $1
      order by line_number asc
    `, [req.params.id]);
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

invoicesRouter.post('/', async (req, res, next) => {
  try {
    const payload = req.body;
    const saved = await withTransaction(async client => {
      const invoice = await client.query(`
        insert into purchase_invoices (
          supplier_id, supplier_name, supplier_nif, doc_number, total_amount,
          date_issued, due_date, status, paid_amount, photo_url,
          primary_archive_document_id, has_qr_code, has_atcud, atcud,
          image_quality_ok, is_missing_pages, compliance_notes
        )
        values ($1, $2, $3, $4, $5, coalesce($6, current_date), $7, coalesce($8, 'PENDENTE'), coalesce($9, 0), $10, $11, $12, $13, $14, $15, $16, $17)
        returning *
      `, [
        payload.supplierId, payload.supplierName, payload.supplierNif, payload.docNumber, payload.totalAmount,
        payload.dateIssued, payload.dueDate, payload.status, payload.paidAmount, payload.photoUrl,
        payload.primaryArchiveDocumentId, payload.hasQrCode, payload.hasAtcud, payload.atcud,
        payload.imageQualityOk, payload.isMissingPages, payload.complianceNotes
      ]);

      const invoiceId = invoice.rows[0].id;
      const lines = [];
      for (const [index, line] of (payload.lines || []).entries()) {
        const lineResult = await client.query(`
          insert into purchase_invoice_lines (
            invoice_id, line_number, product_id, product_alias_id, original_name,
            supplier_item_code, quantity_original, unit_original, conversion_factor,
            quantity_stock, unit_stock, unit_price, total_price, vat_rate, expiry_date, notes
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, 1), $10, $11, $12, $13, $14, $15, $16)
          returning *
        `, [
          invoiceId, line.lineNumber || index + 1, line.productId, line.productAliasId, line.originalName,
          line.supplierItemCode, line.quantityOriginal, line.unitOriginal, line.conversionFactor,
          line.quantityStock, line.unitStock, line.unitPrice, line.totalPrice, line.vatRate, line.expiryDate, line.notes
        ]);
        lines.push(lineResult.rows[0]);

        await client.query(`
          insert into movements (product_id, invoice_line_id, type, quantity, price, supplier_id, supplier_name, notes)
          values ($1, $2, 'ENTRADA', $3, $4, $5, $6, $7)
        `, [
          line.productId,
          lineResult.rows[0].id,
          line.quantityStock,
          line.unitPrice,
          payload.supplierId,
          payload.supplierName,
          `Entrada via Fatura ${payload.docNumber || ''}`
        ]);
      }

      return { invoice: invoice.rows[0], lines };
    });
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
});
