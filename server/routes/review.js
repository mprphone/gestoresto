import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { audit } from '../audit.js';
import { analyzeInvoiceImages } from '../geminiAnalyze.js';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';

export const reviewRouter = Router();

function movementStockFactor(type) {
  return type === 'ENTRADA' ? 1 : -1;
}

async function applyStockDelta(client, req, productId, signedDelta, unitPrice = 0) {
  if (!productId || signedDelta === 0) return null;
  const before = await client.query(
    'select * from products where id = $1 and restaurant_id = $2 for update',
    [productId, req.restaurantId]
  );
  const product = before.rows[0];
  if (!product) {
    const error = new Error('Artigo não encontrado neste restaurante.');
    error.status = 404;
    throw error;
  }

  const currentStock = Number(product.current_stock || 0);
  const averagePrice = Number(product.average_price || 0);
  const nextStock = currentStock + signedDelta;
  if (nextStock < -0.0001) {
    const error = new Error(`Stock insuficiente em ${product.name}.`);
    error.status = 409;
    throw error;
  }

  let nextAveragePrice = averagePrice;
  if (signedDelta > 0) {
    const currentValue = currentStock * averagePrice;
    const incomingValue = signedDelta * Number(unitPrice || 0);
    nextAveragePrice = nextStock > 0 ? (currentValue + incomingValue) / nextStock : Number(unitPrice || 0);
  } else if (signedDelta < 0 && nextStock <= 0) {
    nextAveragePrice = 0;
  }

  const after = await client.query(`
    update products
    set current_stock = $1, average_price = $2
    where id = $3 and restaurant_id = $4
    returning *
  `, [Math.max(0, nextStock), Math.max(0, nextAveragePrice), productId, req.restaurantId]);
  await audit(client, req, 'review_adjust_stock', 'products', productId, product, after.rows[0]);
  return after.rows[0];
}

function normalizeDocumentType(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isCreditInvoice(invoice) {
  if (invoice.document_type === 'NC') return true;
  const qr = String(invoice.qr_code_text || '');
  const match = qr.match(/(?:^|\*)D:([^*]+)/);
  if (normalizeDocumentType(match?.[1]) === 'NC') return true;
  const text = normalizeDocumentType(`${invoice.doc_number || ''} ${invoice.document_type || ''}`);
  return /\bN\/?C\b/.test(text) || text.includes('NOTA DE CREDITO');
}

async function applyCreditNoteStockIfNeeded(client, req, invoice) {
  if (!isCreditInvoice(invoice)) return false;

  const existingMovements = await client.query(`
    select 1
    from movements m
    join purchase_invoice_lines pil on pil.id = m.invoice_line_id
    where pil.invoice_id = $1
    limit 1
  `, [invoice.id]);
  if (invoice.stock_applied_at || existingMovements.rows[0]) return false;

  const lines = await client.query(`
    select *
    from purchase_invoice_lines
    where invoice_id = $1
    order by line_number asc
  `, [invoice.id]);

  for (const line of lines.rows) {
    if (!line.product_id) continue;
    const before = await client.query(
      'select * from products where id = $1 and restaurant_id = $2 for update',
      [line.product_id, req.restaurantId]
    );
    const product = before.rows[0];
    if (!product) continue;

    const currentStock = Number(product.current_stock || 0);
    const quantityStock = Math.abs(Number(line.quantity_stock || 0));
    const nextStock = Math.max(0, currentStock - quantityStock);
    const deficit = currentStock - quantityStock < 0 ? quantityStock - currentStock : 0;
    const note = deficit > 0
      ? `Pendente correção: nota de crédito tentou abater ${quantityStock.toFixed(3)} ${line.unit_stock || product.unit || ''}, mas só existiam ${currentStock.toFixed(3)} ${product.unit || ''}. Diferença ${deficit.toFixed(3)} ${line.unit_stock || product.unit || ''}.`
      : null;

    const after = await client.query(`
      update products
      set current_stock = $1
      where id = $2 and restaurant_id = $3
      returning *
    `, [nextStock, line.product_id, req.restaurantId]);
    await audit(client, req, 'apply_credit_note_stock', 'products', line.product_id, product, after.rows[0]);

    if (note) {
      await client.query(
        'update purchase_invoice_lines set notes = concat_ws($1, notes, $2) where id = $3',
        [' · ', note, line.id]
      );
    }

    await client.query(`
      insert into movements (restaurant_id, product_id, invoice_line_id, type, quantity, price, supplier_id, supplier_name, notes)
      values ($1, $2, $3, 'SAÍDA (REPOSIÇÃO)'::movement_type, $4, $5, $6, $7, $8)
    `, [
      req.restaurantId,
      line.product_id,
      line.id,
      quantityStock,
      line.unit_price,
      invoice.supplier_id,
      invoice.supplier_name,
      [`Nota de Crédito ${invoice.doc_number || ''}`, note].filter(Boolean).join(' · ')
    ]);
  }

  await client.query(
    'update purchase_invoices set stock_applied_at = now() where id = $1 and restaurant_id = $2',
    [invoice.id, req.restaurantId]
  );
  return true;
}

// List invoices pending review (reviewed_at is null)
reviewRouter.get('/pending', async (req, res, next) => {
  try {
    const result = await query(`
      select
        pi.id, pi.doc_number, pi.document_type, pi.supplier_name, pi.supplier_nif,
        pi.total_amount, pi.date_issued, pi.created_at,
        pi.has_qr_code, pi.qr_code_text, pi.qr_total_amount, pi.total_validation_status, pi.expense_category, pi.is_missing_pages,
        pi.ai_read_failed, pi.ai_model, pi.ai_input_tokens, pi.ai_output_tokens, pi.ai_total_tokens, pi.ai_thinking_tokens, pi.ai_attempts,
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

reviewRouter.get('/:id/lines', async (req, res, next) => {
  try {
    const invoice = await query(
      'select id from purchase_invoices where id = $1 and restaurant_id = $2',
      [req.params.id, req.restaurantId]
    );
    if (!invoice.rows[0]) return res.status(404).json({ error: 'Fatura não encontrada' });

    const result = await query(`
      select
        pil.id, pil.invoice_id, pil.line_number, pil.product_id, pil.original_name,
        pil.supplier_item_code, pil.quantity_original, pil.unit_original, pil.conversion_factor,
        pil.quantity_stock, pil.unit_stock, pil.unit_price, pil.total_price, pil.vat_rate, pil.expiry_date, pil.notes,
        p.name as product_name, p.unit as product_unit, p.current_stock,
        m.id as movement_id, m.type as movement_type, m.quantity as movement_quantity, m.notes as movement_notes
      from purchase_invoice_lines pil
      left join products p on p.id = pil.product_id and p.restaurant_id = $2
      left join lateral (
        select id, type, quantity, notes
        from movements
        where invoice_line_id = pil.id and restaurant_id = $2
        order by date_moved desc, id desc
        limit 1
      ) m on true
      where pil.invoice_id = $1
      order by pil.line_number asc
    `, [req.params.id, req.restaurantId]);
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});

reviewRouter.post('/:id/lines/:lineId', async (req, res, next) => {
  try {
    const saved = await withTransaction(async client => {
      const invoiceResult = await client.query(`
        select *
        from purchase_invoices
        where id = $1 and restaurant_id = $2
        for update
      `, [req.params.id, req.restaurantId]);
      const invoice = invoiceResult.rows[0];
      if (!invoice) {
        const error = new Error('Fatura não encontrada');
        error.status = 404;
        throw error;
      }
      if (invoice.reviewed_at) {
        const error = new Error('Esta fatura já foi revista. Volte a colocá-la por rever antes de alterar linhas.');
        error.status = 409;
        throw error;
      }

      const lineResult = await client.query(`
        select *
        from purchase_invoice_lines
        where id = $1 and invoice_id = $2
        for update
      `, [req.params.lineId, req.params.id]);
      const beforeLine = lineResult.rows[0];
      if (!beforeLine) {
        const error = new Error('Linha da fatura não encontrada');
        error.status = 404;
        throw error;
      }

      const productId = req.body.productId || beforeLine.product_id;
      const product = await client.query(
        'select id, name, unit from products where id = $1 and restaurant_id = $2',
        [productId, req.restaurantId]
      );
      if (!product.rows[0]) {
        const error = new Error('Artigo não encontrado neste restaurante.');
        error.status = 404;
        throw error;
      }

      const quantityStock = Number(req.body.quantityStock ?? beforeLine.quantity_stock);
      const quantityOriginal = Number(req.body.quantityOriginal ?? beforeLine.quantity_original ?? quantityStock);
      const unitPrice = Number(req.body.unitPrice ?? beforeLine.unit_price ?? 0);
      const conversionFactor = Number(req.body.conversionFactor ?? beforeLine.conversion_factor ?? 1);
      if (!Number.isFinite(quantityStock) || quantityStock <= 0) {
        const error = new Error('A quantidade de stock tem de ser maior que zero.');
        error.status = 400;
        throw error;
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        const error = new Error('O preço unitário tem de ser positivo.');
        error.status = 400;
        throw error;
      }

      const movementResult = await client.query(`
        select *
        from movements
        where invoice_line_id = $1 and restaurant_id = $2
        order by date_moved desc, id desc
        limit 1
        for update
      `, [beforeLine.id, req.restaurantId]);
      const beforeMovement = movementResult.rows[0] || null;
      const movementType = beforeMovement?.type || (isCreditInvoice(invoice) ? 'SAÍDA (REPOSIÇÃO)' : 'ENTRADA');
      const oldSigned = beforeMovement
        ? movementStockFactor(beforeMovement.type) * Math.abs(Number(beforeMovement.quantity || 0))
        : 0;
      const newSigned = movementStockFactor(movementType) * Math.abs(quantityStock);

      if (beforeLine.product_id) {
        await applyStockDelta(client, req, beforeLine.product_id, -oldSigned, Number(beforeLine.unit_price || beforeMovement?.price || 0));
      }
      await applyStockDelta(client, req, productId, newSigned, unitPrice);

      const afterLine = await client.query(`
        update purchase_invoice_lines
        set product_id = $1,
            original_name = $2,
            quantity_original = $3,
            unit_original = $4,
            conversion_factor = $5,
            quantity_stock = $6,
            unit_stock = $7,
            unit_price = $8,
            total_price = $9,
            notes = $10
        where id = $11 and invoice_id = $12
        returning *
      `, [
        productId,
        String(req.body.originalName || beforeLine.original_name || product.rows[0].name),
        quantityOriginal,
        String(req.body.unitOriginal || beforeLine.unit_original || product.rows[0].unit || 'un'),
        conversionFactor || 1,
        quantityStock,
        String(req.body.unitStock || product.rows[0].unit || beforeLine.unit_stock || 'un'),
        unitPrice,
        Number(req.body.totalPrice ?? (quantityOriginal * unitPrice)),
        req.body.notes ?? beforeLine.notes,
        beforeLine.id,
        req.params.id
      ]);

      const movementNotes = [
        isCreditInvoice(invoice) ? `Nota de Crédito ${invoice.doc_number || ''}` : `Entrada via Fatura ${invoice.doc_number || ''}`,
        'Alterado em revisão',
        req.body.notes ?? beforeLine.notes
      ].filter(Boolean).join(' · ');
      const afterMovement = beforeMovement
        ? await client.query(`
            update movements
            set product_id = $1, type = $2::movement_type, quantity = $3, price = $4, notes = $5
            where id = $6 and restaurant_id = $7
            returning *
          `, [productId, movementType, Math.abs(quantityStock), unitPrice, movementNotes, beforeMovement.id, req.restaurantId])
        : await client.query(`
            insert into movements (restaurant_id, product_id, invoice_line_id, type, quantity, price, supplier_id, supplier_name, notes)
            values ($1, $2, $3, $4::movement_type, $5, $6, $7, $8, $9)
            returning *
          `, [req.restaurantId, productId, beforeLine.id, movementType, Math.abs(quantityStock), unitPrice, invoice.supplier_id, invoice.supplier_name, movementNotes]);

      await audit(client, req, 'review_update_line', 'purchase_invoice_lines', beforeLine.id, beforeLine, afterLine.rows[0]);
      await audit(client, req, beforeMovement ? 'review_update_movement' : 'review_create_movement', 'movements', afterMovement.rows[0].id, beforeMovement, afterMovement.rows[0]);

      return { line: afterLine.rows[0], movement: afterMovement.rows[0] };
    });
    res.json(saved);
  } catch (err) {
    next(err);
  }
});

// Mark invoice as reviewed
reviewRouter.post('/:id/reviewed', async (req, res, next) => {
  try {
    const { userId } = req.body;
    const result = await withTransaction(async client => {
      const before = await client.query(`
        select *
        from purchase_invoices
        where id = $1 and restaurant_id = $2
        for update
      `, [req.params.id, req.restaurantId]);
      const invoice = before.rows[0];
      if (!invoice) {
        const error = new Error('Fatura não encontrada');
        error.status = 404;
        throw error;
      }
      if (invoice.is_missing_pages) {
        const error = new Error('A fatura tem páginas em falta e não pode ser aprovada.');
        error.status = 409;
        throw error;
      }

      const creditStockApplied = await applyCreditNoteStockIfNeeded(client, req, invoice);
      const reviewed = await client.query(`
        update purchase_invoices
        set reviewed_at = now(), reviewed_by = $2
        where id = $1 and restaurant_id = $3
        returning id, reviewed_at, reviewed_by
      `, [req.params.id, userId || null, req.restaurantId]);
      await audit(client, req, 'review', 'purchase_invoices', invoice.id, invoice, reviewed.rows[0]);
      return { ...reviewed.rows[0], creditStockApplied };
    });

    res.json(result);
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

// GET /api/review/pending-guias — movement batches pending admin review
reviewRouter.get('/pending-guias', async (req, res, next) => {
  try {
    const result = await query(`
      select
        m.guia_id,
        m.type as movement_type,
        min(m.date_moved) as created_at,
        count(m.id)::int as item_count,
        json_agg(json_build_object(
          'id', m.id,
          'product_id', m.product_id,
          'name', p.name,
          'quantity', m.quantity,
          'unit', p.unit,
          'photo_url', m.photo_url
        ) order by m.date_moved) as items
      from movements m
      join products p on p.id = m.product_id
      where m.requires_review = true
        and m.reviewed_at is null
        and m.restaurant_id = $1
      group by m.guia_id, m.type
      order by created_at desc
    `, [req.restaurantId]);
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/review/guias/:guiaId/reviewed — approve a movement batch
reviewRouter.post('/guias/:guiaId/reviewed', async (req, res, next) => {
  try {
    const { userId } = req.body;
    await query(`
      update movements
      set reviewed_at = now(), reviewed_by = $2
      where guia_id = $1 and restaurant_id = $3
    `, [req.params.guiaId, userId || null, req.restaurantId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/review/guias/:guiaId/rejected — reject and reverse a movement batch
reviewRouter.post('/guias/:guiaId/rejected', async (req, res, next) => {
  try {
    const { userId } = req.body;
    await query(`
      update movements
      set reviewed_at = now(), reviewed_by = $2, requires_review = false, notes = coalesce(notes, '') || ' [REJEITADO]'
      where guia_id = $1 and restaurant_id = $3
    `, [req.params.guiaId, userId || null, req.restaurantId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/review/:id/reanalyze — run Gemini on archived images and save lines
reviewRouter.post('/:id/reanalyze', async (req, res, next) => {
  try {
    // Fetch invoice and its archived image documents
    const invoiceRes = await query(
      'SELECT * FROM purchase_invoices WHERE id = $1 AND restaurant_id = $2',
      [req.params.id, req.restaurantId]
    );
    if (!invoiceRes.rows[0]) return res.status(404).json({ error: 'Fatura não encontrada' });
    const invoice = invoiceRes.rows[0];

    const docsRes = await query(`
      SELECT id, storage_path, mime_type, original_filename
      FROM digital_archive_documents
      WHERE invoice_id = $1 AND mime_type LIKE 'image/%'
      ORDER BY created_at ASC
    `, [req.params.id]);

    if (docsRes.rows.length === 0) {
      return res.status(400).json({ error: 'Sem imagens arquivadas para re-análise.' });
    }

    // Read images from disk and convert to base64 data URLs
    const images = [];
    for (const doc of docsRes.rows) {
      const absPath = path.isAbsolute(doc.storage_path)
        ? doc.storage_path
        : path.join(config.archiveRoot, doc.storage_path);
      const buffer = await fs.readFile(absPath);
      images.push(`data:${doc.mime_type};base64,${buffer.toString('base64')}`);
    }

    // Call Gemini
    const geminiResult = await analyzeInvoiceImages(images);

    if (!geminiResult.items || geminiResult.items.length === 0) {
      return res.status(422).json({ error: 'A IA não conseguiu extrair artigos desta imagem. Tente melhorar a qualidade da foto.' });
    }

    // Save lines and clear ai_read_failed flag in a transaction
    await withTransaction(async client => {
      // Delete any existing lines (from previous failed attempts)
      await client.query('DELETE FROM purchase_invoice_lines WHERE invoice_id = $1', [req.params.id]);

      for (const [i, item] of geminiResult.items.entries()) {
        await client.query(`
          INSERT INTO purchase_invoice_lines (
            invoice_id, line_number, original_name, quantity_original, unit_original,
            quantity_stock, unit_stock, unit_price, total_price, vat_rate, expiry_date, notes
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `, [
          req.params.id, i + 1, item.name,
          Number(item.quantity) || 1, item.unit || 'un',
          Number(item.quantity) || 1, item.unit || 'un',
          Number(item.unitPrice) || 0, Number(item.totalPrice) || 0,
          Number(item.vatRate) || null,
          item.expiryDate ? item.expiryDate.slice(0, 10) : null,
          null
        ]);
      }

      await client.query(`
        UPDATE purchase_invoices
        SET ai_read_failed = false,
            ai_model = $2, ai_total_tokens = $3
        WHERE id = $1
      `, [req.params.id, geminiResult.aiUsage?.model || null, geminiResult.aiUsage?.totalTokens || null]);

      await audit(client, req, 'reanalyze', 'purchase_invoices', req.params.id, invoice, { itemCount: geminiResult.items.length });
    });

    res.json({ ok: true, itemCount: geminiResult.items.length, geminiResult });
  } catch (err) {
    next(err);
  }
});
