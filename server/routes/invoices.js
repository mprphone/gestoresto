import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import PDFDocument from 'pdfkit';
import { pool, query, withTransaction } from '../db.js';
import { pageRange, pageResult } from '../pagination.js';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { sendTrackedEmail } from '../emailService.js';
import { notifyAdmins } from '../pushService.js';

export const invoicesRouter = Router();

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function documentSerialTail(value) {
  const match = String(value || '').match(/(\d+)\s*$/);
  return match?.[1] || '';
}

function normalizeDocNumber(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function safeFileName(value) {
  return String(value || 'documento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function invoiceBaseName(invoice, payload) {
  const doc = safeFileName(invoice.doc_number || payload.docNumber || 'SN');
  const supplier = safeFileName(invoice.supplier_name || payload.supplierName || 'Fornecedor');
  return `FT_${doc}_${supplier}`;
}

async function insertGeneratedArchiveDocument(client, {
  documentType = 'FATURA',
  restaurantId,
  invoiceId,
  supplierId,
  filename,
  mimeType,
  storagePath,
  localRoot,
  pageCount = 1,
  qualityOk,
  hasQrCode,
  hasAtcud,
  atcud,
  notes
}) {
  const buffer = await fs.readFile(storagePath);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const result = await client.query(`
    insert into digital_archive_documents (
      document_type, invoice_id, supplier_id, original_filename,
      mime_type, byte_size, sha256, storage_provider, storage_path,
      local_root, page_count, quality_ok, has_qr_code, has_atcud, atcud, notes
    )
    values ($1::archive_document_type, $2, $3, $4, $5, $6, $7, 'bunker', $8, $9, $10, $11, $12, $13, $14, $15)
    on conflict (sha256) where sha256 is not null do update set
      invoice_id = coalesce(excluded.invoice_id, digital_archive_documents.invoice_id),
      supplier_id = coalesce(excluded.supplier_id, digital_archive_documents.supplier_id)
    returning *
  `, [
    documentType, invoiceId, supplierId, filename, mimeType, buffer.length, sha256, storagePath,
    localRoot, pageCount, qualityOk, hasQrCode, hasAtcud, atcud || null, notes || null
  ]);
  const saved = result.rows[0];
  if (restaurantId) {
    await client.query('update digital_archive_documents set restaurant_id = $1 where id = $2', [restaurantId, saved.id]);
  }
  const withUrl = await client.query(
    'update digital_archive_documents set public_url = $1 where id = $2 returning *',
    [`/api/archive/file/${saved.id}`, saved.id]
  );
  return withUrl.rows[0];
}

async function generateInvoicePdf({ invoice, payload, imageDocuments, outputPath }) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const doc = new PDFDocument({ autoFirstPage: false, margin: 0, info: {
    Title: invoiceBaseName(invoice, payload),
    Author: 'GestoResto',
    Subject: 'Fatura'
  }});
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });

  const pad = 20;
  for (const [index, image] of imageDocuments.entries()) {
    // Detect image orientation to choose page layout
    let layout = 'portrait';
    try {
      const img = doc.openImage(image.storage_path);
      if (img.width > img.height * 1.1) layout = 'landscape';
    } catch { /* fallback to portrait */ }

    doc.addPage({ size: 'A4', layout, margin: 0 });
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    try {
      doc.image(image.storage_path, pad, pad, {
        fit: [pageWidth - pad * 2, pageHeight - pad * 2],
        align: 'center',
        valign: 'center'
      });
    } catch (error) {
      doc.fontSize(12).fillColor('#991b1b').text(`Não foi possível inserir a imagem da página ${index + 1}.`, 50, 120);
    }
  }

  doc.end();
  await done;
  await fs.writeFile(outputPath, Buffer.concat(chunks));
}

async function assertNotDuplicateInvoice(client, payload, restaurantId) {
  const duplicate = await findDuplicateInvoice(client, payload, restaurantId);
  if (duplicate) {
    const error = new Error(duplicate.message);
    error.statusCode = 409;
    throw error;
  }
}

async function findDuplicateInvoice(client, payload, restaurantId) {
  const supplierNif = onlyDigits(payload.supplierNif);
  const docNumber = normalizeDocNumber(payload.docNumber);
  const totalCents = toCents(payload.totalAmount);
  const dateIssued = payload.dateIssued || new Date().toISOString().slice(0, 10);
  const qrCodeText = String(payload.qrCodeText || '').trim();
  const atcud = String(payload.atcud || '').trim();

  if (qrCodeText || atcud) {
    const fiscalMatch = await client.query(`
      select id, supplier_name, doc_number, total_amount, date_issued
      from purchase_invoices
      where restaurant_id = $3
        and (
          ($1 <> '' and qr_code_text = $1)
          or ($2 <> '' and atcud = $2)
        )
      limit 1
    `, [qrCodeText, atcud, restaurantId]);
    if (fiscalMatch.rows[0]) {
      return {
        kind: 'fiscal',
        invoice: fiscalMatch.rows[0],
        message: `Fatura duplicada: ${fiscalMatch.rows[0].supplier_name} ${fiscalMatch.rows[0].doc_number} já foi registada.`
      };
    }
  }

  if (supplierNif && docNumber) {
    const exact = await client.query(`
      select id, supplier_name, doc_number, total_amount, date_issued
      from purchase_invoices
      where normalized_supplier_nif = $1 and normalized_doc_number = $2 and restaurant_id = $3
      limit 1
    `, [supplierNif, docNumber, restaurantId]);
    if (exact.rows[0]) {
      return {
        kind: 'exact',
        invoice: exact.rows[0],
        message: `Fatura duplicada: ${exact.rows[0].supplier_name} ${exact.rows[0].doc_number} já foi registada.`
      };
    }
  }

  const serialTail = documentSerialTail(payload.docNumber);
  if (supplierNif && serialTail && totalCents !== null) {
    const sameTail = await client.query(`
      select id, supplier_name, doc_number, total_amount, date_issued
      from purchase_invoices
      where normalized_supplier_nif = $1
        and restaurant_id = $3
        and abs(round(total_amount * 100) - $2) <= 1
      order by date_issued desc
      limit 20
    `, [supplierNif, totalCents, restaurantId]);
    const invoice = sameTail.rows.find(row => documentSerialTail(row.doc_number) === serialTail);
    if (invoice) {
      return {
        kind: 'same_serial_tail',
        invoice,
        message: `Possível fatura duplicada: já existe ${invoice.doc_number} com o mesmo fornecedor, total e número final ${serialTail}.`
      };
    }
  }

  if (supplierNif && totalCents !== null) {
    const similar = await client.query(`
      select id, supplier_name, doc_number, total_amount, date_issued
      from purchase_invoices
      where normalized_supplier_nif = $1
        and restaurant_id = $4
        and abs(round(total_amount * 100) - $2) <= 1
        and abs(date_issued - $3::date) <= 3
      order by date_issued desc
      limit 1
    `, [supplierNif, totalCents, dateIssued, restaurantId]);
    if (similar.rows[0]) {
      return {
        kind: 'similar',
        invoice: similar.rows[0],
        message: `Possível fatura duplicada: já existe ${similar.rows[0].doc_number} de ${similar.rows[0].date_issued} com o mesmo fornecedor e total.`
      };
    }
  }

  return null;
}

async function validateRestaurantCustomer(client, payload, restaurantId) {
  const profileResult = await client.query(`
    select id, name, nif
    from restaurants
    where id = $1 and is_active = true
    limit 1
  `, [restaurantId]);
  const profile = profileResult.rows[0] || null;
  const customerNif = onlyDigits(payload.customerNif);

  if (!profile) {
    return {
      profileId: null,
      customerNif: customerNif || null,
      customerName: payload.customerName || null,
      status: 'NAO_VERIFICADO',
      notes: 'Sem perfil do restaurante configurado.'
    };
  }

  const expectedNif = onlyDigits(profile.nif);
  if (!customerNif) {
    return {
      profileId: null,
      customerNif: null,
      customerName: payload.customerName || null,
      status: 'ALERTA',
      notes: `A fatura não tem NIF de cliente legível. NIF esperado: ${expectedNif}.`
    };
  }

  if (customerNif !== expectedNif) {
    return {
      profileId: null,
      customerNif,
      customerName: payload.customerName || null,
      status: 'ALERTA',
      notes: `NIF do cliente (${customerNif}) não corresponde ao NIF do restaurante (${expectedNif}).`
    };
  }

  return {
    profileId: null,
    customerNif,
    customerName: payload.customerName || profile.name,
    status: 'VALIDO',
    notes: null
  };
}

function toCents(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100);
}

function validateInvoiceTotals(payload) {
  const invoiceTotalCents = toCents(payload.totalAmount);
  const qrTotalCents = toCents(payload.qrTotalAmount);
  const notes = [];

  if (invoiceTotalCents === null) {
    return { status: 'ALERTA', notes: 'Total da fatura inválido ou ausente.' };
  }

  if (qrTotalCents !== null && qrTotalCents !== invoiceTotalCents) {
    notes.push(`Total do QR (${(qrTotalCents / 100).toFixed(2)}) não corresponde ao total da fatura (${(invoiceTotalCents / 100).toFixed(2)}).`);
  }

  return {
    status: notes.length > 0 ? 'ALERTA' : (qrTotalCents !== null ? 'VALIDO' : 'NAO_VERIFICADO'),
    notes: notes.join(' ')
  };
}

function preferFiscalQrTotal(payload) {
  const qrTotalCents = toCents(payload.qrTotalAmount);
  if (qrTotalCents === null) return;
  const ocrTotalCents = toCents(payload.totalAmount);
  if (ocrTotalCents !== null && ocrTotalCents !== qrTotalCents) {
    payload.complianceNotes = [
      payload.complianceNotes,
      `Total OCR ${(ocrTotalCents / 100).toFixed(2)} substituído pelo total fiscal do QR ${(qrTotalCents / 100).toFixed(2)}.`
    ].filter(Boolean).join(' ');
  }
  payload.totalAmount = qrTotalCents / 100;
}

invoicesRouter.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, limit, offset } = pageRange(req);
    const result = await query(`
      select *
      from purchase_invoices
      where restaurant_id = $3
      order by date_issued desc, id desc
      limit $1 offset $2
    `, [limit, offset, req.restaurantId]);
    const count = await query('select count(*) from purchase_invoices where restaurant_id = $1', [req.restaurantId]);
    res.json(pageResult(result.rows, count.rows[0].count, page, pageSize));
  } catch (error) {
    next(error);
  }
});

invoicesRouter.get('/:id/lines', async (req, res, next) => {
  try {
    const result = await query(`
      select pil.*
      from purchase_invoice_lines pil
      join purchase_invoices pi on pi.id = pil.invoice_id
      where pil.invoice_id = $1 and pi.restaurant_id = $2
      order by line_number asc
    `, [req.params.id, req.restaurantId]);
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

invoicesRouter.post('/check-duplicate', async (req, res, next) => {
  try {
    const duplicate = await findDuplicateInvoice(pool, req.body || {}, req.restaurantId);
    res.json({ duplicate: Boolean(duplicate), ...(duplicate || {}) });
  } catch (error) {
    next(error);
  }
});

const normalizeDocumentType = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/\s+/g, ' ')
  .trim();

function inferDocumentType(payload) {
  const qrType = (() => {
    const qr = String(payload.qrCodeText || '');
    const match = qr.match(/(?:^|\*)D:([^*]+)/);
    return match ? match[1] : '';
  })();
  const text = normalizeDocumentType([
    payload.documentType,
    qrType,
    payload.docNumber,
    payload.ocrJson?.documentType,
    payload.ocrJson?.invoiceNumber
  ].filter(Boolean).join(' '));

  if (/\bN\/?C\b/.test(text) || text.includes('NOTA DE CREDITO')) return 'NC';
  if (/\bN\/?D\b/.test(text) || text.includes('NOTA DE DEBITO')) return 'ND';
  if (/\bFR\b/.test(text) || text.includes('FATURA-RECIBO') || text.includes('FATURA RECIBO')) return 'FR';
  if (/\bFS\b/.test(text) || text.includes('FATURA SIMPLIFICADA')) return 'FS';
  if (/\bFT\b/.test(text) || text.includes('FATURA')) return 'FT';
  return undefined;
}

// Detects credit/debit notes by explicit type, doc number prefix or negative total
function isCreditNote(payload) {
  const documentType = inferDocumentType(payload);
  const doc = normalizeDocumentType(payload.docNumber);
  return documentType === 'NC' || documentType === 'ND' || doc.startsWith('NC') || doc.startsWith('ND') || doc.startsWith('NA') ||
    Number(payload.totalAmount || 0) < 0;
}

invoicesRouter.post('/', async (req, res, next) => {
  try {
    const payload = req.body;
    payload.documentType = payload.documentType || inferDocumentType(payload);
    const isCredit = isCreditNote(payload);
    if (!isCredit) preferFiscalQrTotal(payload);
    // For credit notes, negate quantities and total so stock is reduced
    if (isCredit) {
      payload.totalAmount = -Math.abs(Number(payload.totalAmount || 0));
      // Clear QR total so validation doesn't mismatch with negated invoice total
      payload.qrTotalAmount = undefined;
      payload.totalValidationStatus = 'NAO_VERIFICADO';
      if (Array.isArray(payload.lines)) {
        payload.lines = payload.lines.map(line => ({
          ...line,
          quantityOriginal: -Math.abs(Number(line.quantityOriginal || 0)),
          quantityStock: -Math.abs(Number(line.quantityStock || 0)),
          totalPrice: -Math.abs(Number(line.totalPrice || 0))
        }));
      }
    }
    const saved = await withTransaction(async client => {
      const restaurantValidation = await validateRestaurantCustomer(client, payload, req.restaurantId);
      const totalValidation = validateInvoiceTotals(payload);
      await assertNotDuplicateInvoice(client, payload, req.restaurantId);
      let supplierId = payload.supplierId || null;
      if (!supplierId && payload.supplierNif) {
        const normalizedSupplierNif = onlyDigits(payload.supplierNif);
        const existingSupplier = await client.query(`
          select *
          from suppliers
          where restaurant_id = $1 and normalized_nif = $2
          order by created_at asc nulls last, id asc
          limit 1
        `, [req.restaurantId, normalizedSupplierNif]);

        const supplier = existingSupplier.rows[0]
          ? await client.query(`
              update suppliers
              set name = $1,
                  nif = $2,
                  email = coalesce($3, email),
                  phone = coalesce($4, phone),
                  payment_terms_days = coalesce($5, payment_terms_days)
              where id = $6
              returning *
            `, [
              payload.supplierName || existingSupplier.rows[0].name || 'Fornecedor',
              normalizedSupplierNif,
              payload.supplierEmail || null,
              payload.supplierPhone || null,
              payload.paymentTermsDays || null,
              existingSupplier.rows[0].id
            ])
          : await client.query(`
              insert into suppliers (name, nif, email, phone, payment_terms_days, restaurant_id)
              values ($1, $2, $3, $4, coalesce($5, 30), $6)
              returning *
            `, [
              payload.supplierName || 'Fornecedor',
              normalizedSupplierNif,
              payload.supplierEmail || null,
              payload.supplierPhone || null,
              payload.paymentTermsDays || 30,
              req.restaurantId
            ]);
        supplierId = supplier.rows[0].id;
        await audit(client, req, 'upsert', 'suppliers', supplierId, null, supplier.rows[0]);
      }

      const invoice = await client.query(`
        insert into purchase_invoices (
          restaurant_id,
          supplier_id, supplier_name, supplier_nif,
          customer_name, customer_nif, restaurant_profile_id, restaurant_match_status, restaurant_match_notes,
          doc_number, total_amount,
          date_issued, due_date, status, paid_amount, photo_url,
          primary_archive_document_id, has_qr_code, has_atcud, atcud,
          image_quality_ok, is_missing_pages,
          qr_code_text, qr_total_amount, calculated_lines_total, total_validation_status, total_validation_notes,
          compliance_notes, ai_model, ai_input_tokens, ai_output_tokens, ai_total_tokens, ai_thinking_tokens, ai_attempts, expense_category
        )
        values (
          $1,
          $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, coalesce($12, current_date), $13, coalesce($14::invoice_status, 'PENDENTE'::invoice_status), coalesce($15, 0), $16,
          $17, $18, $19, $20, $21, $22,
          $23, $24, $25, $26, $27,
          $28, $29, $30, $31, $32, $33, $34, $35
        )
        returning *
      `, [
        req.restaurantId,
        supplierId, payload.supplierName, onlyDigits(payload.supplierNif),
        restaurantValidation.customerName, restaurantValidation.customerNif, restaurantValidation.profileId,
        restaurantValidation.status, restaurantValidation.notes,
        payload.docNumber, payload.totalAmount,
        payload.dateIssued, payload.dueDate, payload.status, payload.paidAmount, payload.photoUrl,
        payload.primaryArchiveDocumentId, payload.hasQrCode, payload.hasAtcud, payload.atcud,
        payload.imageQualityOk, payload.isMissingPages,
        payload.qrCodeText, payload.qrTotalAmount, payload.calculatedLinesTotal, totalValidation.status, totalValidation.notes || null,
        payload.complianceNotes,
        payload.aiUsage?.model || null,
        payload.aiUsage?.inputTokens ?? null,
        payload.aiUsage?.outputTokens ?? null,
        payload.aiUsage?.totalTokens ?? null,
        payload.aiUsage?.thinkingTokens ?? null,
        payload.aiUsage?.attempts ?? null,
        payload.expenseCategory || null
      ]);

      if (!invoice.rows[0]) {
        const error = new Error('Fatura duplicada para este fornecedor');
        error.statusCode = 409;
        throw error;
      }

      const invoiceId = invoice.rows[0].id;
      let archiveDocument = null;
      const archiveDocumentIds = Array.isArray(payload.archiveDocumentIds) && payload.archiveDocumentIds.length > 0
        ? payload.archiveDocumentIds
        : (payload.archiveDocumentId ? [payload.archiveDocumentId] : []);
      const archiveDocuments = [];
      for (const archiveDocumentId of archiveDocumentIds) {
        const archive = await client.query(`
          update digital_archive_documents
          set invoice_id = $1, supplier_id = coalesce($2, supplier_id), restaurant_id = $4
          where id = $3 and (restaurant_id = $4 or restaurant_id is null)
          returning *
        `, [invoiceId, supplierId, archiveDocumentId, req.restaurantId]);
        if (archive.rows[0]) archiveDocuments.push(archive.rows[0]);
      }
      archiveDocument = archiveDocuments[0] || null;
      if (archiveDocument) {
          await client.query(`
            update purchase_invoices
            set primary_archive_document_id = $1, photo_url = coalesce($2, photo_url)
            where id = $3
          `, [archiveDocument.id, archiveDocument.public_url, invoiceId]);
      }

      let pdfDocument = null;
      let jsonDocument = null;
      if (archiveDocuments.length > 0) {
        const baseName = invoiceBaseName(invoice.rows[0], payload);
        const folder = path.join(config.archiveRoot, 'faturas', String(invoiceId));
        const pdfPath = path.join(folder, `${baseName}.pdf`);
        const jsonPath = path.join(folder, `${baseName}.json`);
        const ocrPayload = {
          invoice: invoice.rows[0],
          extracted: payload.ocrJson || null,
          validation: {
            hasQrCode: payload.hasQrCode,
            qrCodeText: payload.qrCodeText,
            qrTotalAmount: payload.qrTotalAmount,
            calculatedLinesTotal: payload.calculatedLinesTotal,
            totalValidationStatus: totalValidation.status,
            totalValidationNotes: totalValidation.notes || null
          },
          lines: payload.lines || [],
          sourceImages: archiveDocuments.map(doc => ({
            id: doc.id,
            originalFilename: doc.original_filename,
            mimeType: doc.mime_type,
            sha256: doc.sha256,
            storagePath: doc.storage_path,
            publicUrl: doc.public_url
          })),
          processedAt: new Date().toISOString()
        };

        await fs.mkdir(folder, { recursive: true });
        await fs.writeFile(jsonPath, JSON.stringify(ocrPayload, null, 2));
        jsonDocument = await insertGeneratedArchiveDocument(client, {
          documentType: 'OUTRO',
          restaurantId: req.restaurantId,
          invoiceId,
          supplierId,
          filename: `${baseName}.json`,
          mimeType: 'application/json',
          storagePath: jsonPath,
          localRoot: config.archiveRoot,
          pageCount: 1,
          qualityOk: payload.imageQualityOk,
          hasQrCode: payload.hasQrCode,
          hasAtcud: payload.hasAtcud,
          atcud: payload.atcud,
          notes: 'JSON OCR extraído automaticamente.'
        });

        await generateInvoicePdf({ invoice: invoice.rows[0], payload, imageDocuments: archiveDocuments, outputPath: pdfPath });
        pdfDocument = await insertGeneratedArchiveDocument(client, {
          documentType: 'FATURA',
          restaurantId: req.restaurantId,
          invoiceId,
          supplierId,
          filename: `${baseName}.pdf`,
          mimeType: 'application/pdf',
          storagePath: pdfPath,
          localRoot: config.archiveRoot,
          pageCount: archiveDocuments.length,
          qualityOk: payload.imageQualityOk,
          hasQrCode: payload.hasQrCode,
          hasAtcud: payload.hasAtcud,
          atcud: payload.atcud,
          notes: 'PDF gerado automaticamente a partir das imagens originais.'
        });
      }

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

        const productBefore = await client.query('select * from products where id = $1 and restaurant_id = $2 for update', [line.productId, req.restaurantId]);
        const product = productBefore.rows[0];
        if (product) {
          const currentStock = Number(product.current_stock || 0);
          const averagePrice = Number(product.average_price || 0);
          const quantityStock = Number(line.quantityStock || 0);
          const unitPrice = Number(line.unitPrice || 0);
          const currentValue = currentStock * averagePrice;
          const incomingValue = Number(line.quantityOriginal || 0) * unitPrice;
          const totalStock = currentStock + quantityStock;
          const stockDeficit = totalStock < 0 ? Math.abs(totalStock) : 0;
          const nextStock = Math.max(0, totalStock);
          const newAveragePrice = quantityStock < 0
            ? averagePrice
            : (nextStock > 0 ? (currentValue + incomingValue) / nextStock : unitPrice);
          const stockCorrectionNote = stockDeficit > 0
            ? `Pendente correção: nota de crédito tentou abater ${Math.abs(quantityStock).toFixed(3)} ${line.unitStock || product.unit || ''}, mas só existiam ${currentStock.toFixed(3)} ${product.unit || ''}. Diferença ${stockDeficit.toFixed(3)} ${line.unitStock || product.unit || ''}.`
            : null;

          const productAfter = await client.query(`
            update products
            set current_stock = $1, average_price = $2
            where id = $3 and restaurant_id = $4
            returning *
          `, [nextStock, newAveragePrice, line.productId, req.restaurantId]);
          await audit(client, req, 'update_stock', 'products', line.productId, product, productAfter.rows[0]);
          if (stockCorrectionNote) {
            line.notes = [line.notes, stockCorrectionNote].filter(Boolean).join(' ');
            await client.query(
              'update purchase_invoice_lines set notes = $1 where id = $2',
              [line.notes, lineResult.rows[0].id]
            );
          }
        }

        if (line.originalName && line.productId) {
          const existingAlias = await client.query(`
            select *
            from product_aliases
            where supplier_id is not distinct from $1
              and normalized_supplier_item_name = normalize_search_text($2)
              and coalesce(supplier_item_code, '') = coalesce($3, '')
            order by created_at asc nulls last, id asc
            limit 1
          `, [supplierId, line.originalName, line.supplierItemCode || null]);
          const alias = existingAlias.rows[0]
            ? await client.query(`
                update product_aliases
                set product_id = $1,
                    supplier_unit = $2,
                    product_unit = $3,
                    conversion_factor = coalesce($4, 1),
                    confidence = coalesce($5, 100),
                    last_seen_at = now()
                where id = $6
                returning *
              `, [
                line.productId,
                line.unitOriginal,
                line.unitStock,
                line.conversionFactor || 1,
                line.confidence || 100,
                existingAlias.rows[0].id
              ])
            : await client.query(`
                insert into product_aliases (
                  supplier_id, product_id, supplier_item_name, supplier_item_code,
                  supplier_unit, product_unit, conversion_factor, confidence, last_seen_at
                )
                values ($1, $2, $3, $4, $5, $6, coalesce($7, 1), coalesce($8, 100), now())
                returning *
              `, [
                supplierId,
                line.productId,
                line.originalName,
                line.supplierItemCode || null,
                line.unitOriginal,
                line.unitStock,
                line.conversionFactor || 1,
                line.confidence || 100
              ]);
          await audit(client, req, 'learn_alias', 'product_aliases', alias.rows[0].id, null, alias.rows[0]);

          if (line.unitOriginal && line.unitStock && line.unitOriginal !== line.unitStock) {
            const existingConversion = await client.query(`
              select id
              from product_unit_conversions
              where product_id = $1
                and supplier_id is not distinct from $2
                and from_unit = $3
                and to_unit = $4
              limit 1
            `, [line.productId, supplierId, line.unitOriginal, line.unitStock]);
            const conversionValues = [
              line.productId,
              supplierId,
              line.unitOriginal,
              line.unitStock,
              line.conversionFactor || 1,
              `Aprendido via fatura ${payload.docNumber || ''}`
            ];
            if (existingConversion.rows[0]) {
              await client.query(`
                update product_unit_conversions
                set factor = $1, notes = $2
                where id = $3
              `, [line.conversionFactor || 1, `Aprendido via fatura ${payload.docNumber || ''}`, existingConversion.rows[0].id]);
            } else {
              await client.query(`
                insert into product_unit_conversions (product_id, supplier_id, from_unit, to_unit, factor, notes)
                values ($1, $2, $3, $4, coalesce($5, 1), $6)
              `, conversionValues);
            }
          }
        }

        const movementNotes = [
          isCredit
            ? `Nota de Crédito ${payload.docNumber || ''}`
            : `Entrada via Fatura ${payload.docNumber || ''}`,
          line.notes
        ].filter(Boolean).join(' · ');
        await client.query(`
          insert into movements (restaurant_id, product_id, invoice_line_id, type, quantity, price, supplier_id, supplier_name, notes)
          values ($1, $2, $3, 'ENTRADA'::movement_type, $4, $5, $6, $7, $8)
        `, [
          req.restaurantId,
          line.productId,
          lineResult.rows[0].id,
          line.quantityStock,
          line.unitPrice,
          supplierId,
          payload.supplierName,
          movementNotes
        ]);
      }

      await audit(client, req, 'create', 'purchase_invoices', invoiceId, null, { ...invoice.rows[0], lines });
      {
        // Fetch notification emails from restaurant profile; fall back to config
        const profileEmails = req.restaurantEmails || [];
        const recipients = profileEmails.length > 0
          ? profileEmails
          : (config.invoiceOkEmailTo ? [config.invoiceOkEmailTo] : []);

        if (recipients.length > 0) {
          const invoiceAttachments = pdfDocument?.storage_path
            ? [{
                filename: pdfDocument.original_filename || `${invoiceBaseName(invoice.rows[0], payload)}.pdf`,
                path: pdfDocument.storage_path,
                contentType: 'application/pdf'
              }]
            : archiveDocuments
                .filter(doc => doc.storage_path)
                .map((doc, index) => ({
                  filename: doc.original_filename || `fatura-${payload.docNumber || invoiceId}-pag-${index + 1}.jpg`,
                  path: doc.storage_path,
                  contentType: doc.mime_type || undefined
                }));
          const emailBody = [
            'Foi registada uma fatura no GestoResto.',
            '',
            `Fornecedor: ${payload.supplierName || '-'}`,
            `NIF fornecedor: ${payload.supplierNif || '-'}`,
            `Documento: ${payload.docNumber || 'S/N'}`,
            `Total: ${Number(payload.totalAmount || 0).toFixed(2)} EUR`,
            `QR: ${payload.qrTotalAmount ? `OK (${Number(payload.qrTotalAmount).toFixed(2)} EUR)` : 'Não verificado'}`,
            `PDF: ${pdfDocument?.public_url || 'Não gerado'}`,
            `Arquivo original: ${archiveDocument?.public_url || invoice.rows[0].photo_url || 'Sem URL'}`,
            '',
            'Estado: fatura guardada com sucesso.'
          ].join('\n');
          const emailSubject = `Fatura registada: ${payload.docNumber || 'S/N'} - ${payload.supplierName || 'Fornecedor'}`;
          for (const recipient of recipients) {
            await sendTrackedEmail(client, req, {
              recipient,
              subject: emailSubject,
              body: emailBody,
              attachments: invoiceAttachments,
              relatedEntityTable: 'purchase_invoices',
              relatedEntityId: invoiceId
            });
          }
        }
      }
      // Push notification to all admin users
      notifyAdmins({
        type: 'new_invoice',
        title: '📄 Nova Fatura Registada',
        body: `${payload.supplierName || 'Fornecedor'} · ${payload.docNumber || 'S/N'} · €${Number(payload.totalAmount || 0).toFixed(2)}`,
        invoiceId
      }).catch(err => console.error('Push notify error:', err));

      return { invoice: invoice.rows[0], lines, archiveDocument, pdfDocument, jsonDocument };
    });
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
});
