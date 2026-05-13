import { Router } from 'express';
import { query } from '../db.js';

export const reviewRouter = Router();

// List invoices pending review (reviewed_at is null)
reviewRouter.get('/pending', async (_req, res, next) => {
  try {
    const result = await query(`
      select
        pi.id, pi.doc_number, pi.supplier_name, pi.supplier_nif,
        pi.total_amount, pi.date_issued, pi.created_at,
        pi.has_qr_code, pi.qr_total_amount, pi.total_validation_status,
        pi.reviewed_at, pi.reviewed_by,
        u.name as reviewed_by_name,
        count(pil.id)::int as line_count,
        dad.id as archive_id,
        dad.mime_type as archive_mime_type,
        dad.original_filename as archive_filename
      from purchase_invoices pi
      left join app_users u on u.id = pi.reviewed_by
      left join purchase_invoice_lines pil on pil.invoice_id = pi.id
      left join digital_archive_documents dad
        on dad.id = pi.primary_archive_document_id
        or (dad.invoice_id = pi.id and dad.document_type = 'FATURA')
      where pi.reviewed_at is null
      group by pi.id, u.name, dad.id
      order by pi.created_at desc
    `);
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
      where id = $1
      returning id, reviewed_at, reviewed_by
    `, [req.params.id, userId || null]);

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
      'update purchase_invoices set reviewed_at = null, reviewed_by = null where id = $1',
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
