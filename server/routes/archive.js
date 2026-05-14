import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import multer from 'multer';
import { query } from '../db.js';
import { config } from '../config.js';
import { pageRange, pageResult } from '../pagination.js';
import { requireRestaurantContext } from '../middleware/restaurantContext.js';

export const archiveRouter = Router();

archiveRouter.use((req, res, next) => {
  if (req.path.startsWith('/file/')) return next();
  return requireRestaurantContext(req, res, next);
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

function folderForType(type) {
  if (type === 'COMPROVATIVO') return 'comprovativos';
  if (type === 'FATURA') return 'faturas';
  if (type === 'GUIA') return 'guias';
  return 'imports';
}

function safeFileName(name) {
  return String(name || 'documento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

archiveRouter.get('/invoice/:invoiceId', async (req, res, next) => {
  try {
    const { page, pageSize, limit, offset } = pageRange(req);
    const result = await query(`
      select *
      from digital_archive_documents
      where invoice_id = $1 and restaurant_id = $4
      order by created_at desc
      limit $2 offset $3
    `, [req.params.invoiceId, limit, offset, req.restaurantId]);
    const count = await query('select count(*) from digital_archive_documents where invoice_id = $1 and restaurant_id = $2', [req.params.invoiceId, req.restaurantId]);
    res.json(pageResult(result.rows, count.rows[0].count, page, pageSize));
  } catch (error) {
    next(error);
  }
});

archiveRouter.get('/file/:id', async (req, res, next) => {
  try {
    const result = await query('select storage_path, mime_type, original_filename from digital_archive_documents where id = $1', [req.params.id]);
    const doc = result.rows[0];
    if (!doc || !doc.storage_path || !fsSync.existsSync(doc.storage_path)) {
      res.status(404).json({ error: 'document not found' });
      return;
    }
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${doc.original_filename || 'documento'}"`);
    fsSync.createReadStream(doc.storage_path).pipe(res);
  } catch (error) {
    next(error);
  }
});

archiveRouter.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'file is required' });
      return;
    }

    const documentType = req.body.documentType || 'FATURA';
    const folder = folderForType(documentType);
    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const ext = path.extname(req.file.originalname) || '.bin';
    const fileName = `${new Date().toISOString().slice(0, 10)}-${sha256.slice(0, 16)}-${safeFileName(req.file.originalname || `ficheiro${ext}`)}`;
    const relativePath = path.join(folder, fileName);
    const absolutePath = path.join(config.archiveRoot, relativePath);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, req.file.buffer, { flag: 'wx' }).catch(async error => {
      if (error.code !== 'EEXIST') throw error;
    });

    const result = await query(`
      insert into digital_archive_documents (
        document_type, restaurant_id, invoice_id, payment_id, supplier_id, original_filename,
        mime_type, byte_size, sha256, storage_provider, storage_path,
        local_root, page_count, quality_ok, has_qr_code, has_atcud, atcud, notes
      )
      values ($1::archive_document_type, $2, $3, $4, $5, $6, $7, $8, $9, 'bunker', $10, $11, coalesce($12, 1), $13, $14, $15, $16, $17)
      on conflict (sha256) where sha256 is not null do update set
        invoice_id = coalesce(excluded.invoice_id, digital_archive_documents.invoice_id),
        payment_id = coalesce(excluded.payment_id, digital_archive_documents.payment_id),
        supplier_id = coalesce(excluded.supplier_id, digital_archive_documents.supplier_id),
        restaurant_id = coalesce(digital_archive_documents.restaurant_id, excluded.restaurant_id)
      returning *
    `, [
      documentType, req.restaurantId, req.body.invoiceId || null, req.body.paymentId || null, req.body.supplierId || null,
      req.file.originalname, req.file.mimetype, req.file.size, sha256, absolutePath,
      config.archiveRoot, req.body.pageCount, req.body.qualityOk, req.body.hasQrCode,
      req.body.hasAtcud, req.body.atcud || null, req.body.notes || null
    ]);

    const saved = result.rows[0];
    const withUrl = await query(
      'update digital_archive_documents set public_url = $1 where id = $2 returning *',
      [`/api/archive/file/${saved.id}`, saved.id]
    );

    res.status(201).json(withUrl.rows[0]);
  } catch (error) {
    next(error);
  }
});
