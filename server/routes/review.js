import { Router } from 'express';
import { query } from '../db.js';

export const reviewRouter = Router();

// List invoices pending review (reviewed_at is null)
reviewRouter.get('/pending', async (req, res, next) => {
  try {
    const result = await query(`
      select
        pi.id, pi.doc_number, pi.supplier_name, pi.supplier_nif,
        pi.total_amount, pi.date_issued, pi.created_at,
        pi.has_qr_code, pi.qr_code_text, pi.qr_total_amount, pi.total_validation_status, pi.expense_category,
        pi.ai_model, pi.ai_input_tokens, pi.ai_output_tokens, pi.ai_total_tokens, pi.ai_thinking_tokens, pi.ai_attempts,
        pi.reviewed_at, pi.reviewed_by,
        u.name as reviewed_by_name,
        count(pil.id)::int as line_count,
        dad.id as archive_id,
        dad.mime_type as archive_mime_type,
        dad.original_filename as archive_filename
      from purchase_invoices pi
      left join app_users u on u.id = pi.reviewed_by
      left join purchase_invoice_lines pil on pil.invoice_id = pi.id
      left join lateral (
        select id, mime_type, original_filename
        from digital_archive_documents
        where id = pi.primary_archive_document_id
           or (invoice_id = pi.id and document_type = 'FATURA')
        order by
          case mime_type
            when 'image/jpeg' then 1
            when 'image/png'  then 2
            when 'application/pdf' then 3
            else 4
          end
        limit 1
      ) dad on true
      where pi.reviewed_at is null and pi.restaurant_id = $1
      group by pi.id, u.name, dad.id, dad.mime_type, dad.original_filename
      order by pi.created_at desc
    `, [req.restaurantId]);
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});

// Mark invoice as reviewed
reviewRouter.post('/:id/reviewed', async (req, res, next) => {
  try {
    const { userId } = req.body;
    const result = await query(`
      update purchase_invoices
      set reviewed_at = now(), reviewed_by = $2
      where id = $1 and restaurant_id = $3
      returning id, reviewed_at, reviewed_by
    `, [req.params.id, userId || null, req.restaurantId]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Fatura não encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Mark invoice as unreviewed (undo)
reviewRouter.post('/:id/unreviewed', async (req, res, next) => {
  try {
    await query(
      'update purchase_invoices set reviewed_at = null, reviewed_by = null where id = $1 and restaurant_id = $2',
      [req.params.id, req.restaurantId]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

reviewRouter.post('/:id/expense-category', async (req, res, next) => {
  try {
    const category = String(req.body?.expenseCategory || '').trim() || null;
    const result = await query(`
      update purchase_invoices
      set expense_category = $2
      where id = $1 and restaurant_id = $3
      returning id, expense_category
    `, [req.params.id, category, req.restaurantId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Fatura não encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});
