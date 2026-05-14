import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import PDFDocument from 'pdfkit';
import { query, withTransaction } from '../db.js';
import { pageRange, pageResult } from '../pagination.js';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { sendTrackedEmail } from '../emailService.js';
import { notifyAdmins } from '../pushService.js';

export const invoicesRouter = Router();

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
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
  const withUrl = await client.query(
    'update digital_archive_documents set public_url = $1 where id = $2 returning *',
    [`/api/archive/file/${saved.id}`, saved.id]
  );
  return withUrl.rows[0];
}

async function generateInvoicePdf({ invoice, payload, imageDocuments, outputPath }) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const doc = new PDFDocument({ size: 'A4', autoFirstPage: false, margin: 36, info: {
    Title: invoiceBaseName(invoice, payload),
    Author: 'GestoResto',
    Subject: 'Fatura processada automaticamente'
  }});
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });
  const processedAt = new Date();
  const qrState = payload.hasQrCode ? 'OK' : 'Falhou';

  for (const [index, image] of imageDocuments.entries()) {
    doc.addPage({ size: 'A4', margin: 36 });
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const footerHeight = 34;
    const contentTop = 28;
    const contentHeight = pageHeight - contentTop - footerHeight - 34;
    try {
      doc.image(image.storage_path, 28, contentTop, {
        fit: [pageWidth - 56, contentHeight],
        align: 'center',
        valign: 'center'
      });
    } catch (error) {
      doc.fontSize(12).fillColor('#991b1b').text(`Não foi possível inserir a imagem da página ${index + 1}.`, 50, 120);
    }
    doc
      .moveTo(36, pageHeight - footerHeight - 8)
      .lineTo(pageWidth - 36, pageHeight - footerHeight - 8)
      .strokeColor('#d1d5db')
      .lineWidth(0.5)
      .stroke();
    doc
      .fontSize(8)
      .fillColor('#475569')
      .text(
        `Processado automaticamente por GestoResto | Estado QR: ${qrState} | ${processedAt.toISOString()} | Nº interno: ${invoice.id} | Página ${index + 1}/${imageDocuments.length}`,
        36,
        pageHeight - footerHeight,
        { width: pageWidth - 72, align: 'center' }
      );
  }

  doc.end();
  await done;
  await fs.writeFile(outputPath, Buffer.concat(chunks));
}

async function assertNotDuplicateInvoice(client, payload) {
  const supplierNif = onlyDigits(payload.supplierNif);
  const docNumber = normalizeDocNumber(payload.docNumber);
  const totalCents = toCents(payload.totalAmount);
  const dateIssued = payload.dateIssued || new Date().toISOString().slice(0, 10);

  if (supplierNif && docNumber) {
    const exact = await client.query(`
      select id, supplier_name, doc_number, total_amount, date_issued
      from purchase_invoices
      where normalized_supplier_nif = $1 and normalized_doc_number = $2
      limit 1
    `, [supplierNif, docNumber]);
    if (exact.rows[0]) {
      const error = new Error(`Fatura duplicada: ${exact.rows[0].supplier_name} ${exact.rows[0].doc_number} já foi registada.`);
      error.statusCode = 409;
      throw error;
    }
  }

  if (supplierNif && totalCents !== null) {
    const similar = await client.query(`
      select id, supplier_name, doc_number, total_amount, date_issued
      from purchase_invoices
      where normalized_supplier_nif = $1
        and abs(round(total_amount * 100) - $2) <= 1
        and abs(date_issued - $3::date) <= 3
      order by date_issued desc
      limit 1
    `, [supplierNif, totalCents, dateIssued]);
    if (similar.rows[0]) {
      const error = new Error(`Possível fatura duplicada: já existe ${similar.rows[0].doc_number} de ${similar.rows[0].date_issued} com o mesmo fornecedor e total.`);
      error.statusCode = 409;
      throw error;
    }
  }
}

async function validateRestaurantCustomer(client, payload) {
  const profileResult = await client.query(`
    select *
    from restaurant_profile
    where is_active = true
    order by updated_at desc
    limit 1
  `);
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
      profileId: profile.id,
      customerNif: null,
      customerName: payload.customerName || null,
      status: 'ALERTA',
      notes: `A fatura não tem NIF de cliente legível. NIF esperado: ${expectedNif}.`
    };
  }

  if (customerNif !== expectedNif) {
    return {
      profileId: profile.id,
      customerNif,
      customerName: payload.customerName || null,
      status: 'ALERTA',
      notes: `NIF do cliente (${customerNif}) não corresponde ao NIF do restaurante (${expectedNif}).`
    };
  }

  return {
    profileId: profile.id,
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

// Detects credit/debit notes by doc number prefix (NC, ND, NA) or negative total
function isCreditNote(payload) {
  const doc = String(payload.docNumber || '').trim().toUpperCase();
  return doc.startsWith('NC') || doc.startsWith('ND') || doc.startsWith('NA') ||
    Number(payload.totalAmount || 0) < 0;
}

invoicesRouter.post('/', async (req, res, next) => {
  try {
    const payload = req.body;
    const isCredit = isCreditNote(payload);
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
      const restaurantValidation = await validateRestaurantCustomer(client, payload);
      const totalValidation = validateInvoiceTotals(payload);
      if (totalValidation.status === 'ALERTA') {
        const error = new Error(totalValidation.notes || 'Os totais da fatura não correspondem.');
        error.statusCode = 422;
        throw error;
      }
      await assertNotDuplicateInvoice(client, payload);
      let supplierId = payload.supplierId || null;
      if (!supplierId && payload.supplierNif) {
        const normalizedSupplierNif = onlyDigits(payload.supplierNif);
        const supplier = await client.query(`
          insert into suppliers (name, nif, email, phone, payment_terms_days)
          values ($1, $2, $3, $4, coalesce($5, 30))
          on conflict (normalized_nif) where normalized_nif <> '' do update set
            name = excluded.name,
            nif = excluded.nif,
            email = coalesce(excluded.email, suppliers.email),
            phone = coalesce(excluded.phone, suppliers.phone)
          returning *
        `, [
          payload.supplierName || 'Fornecedor',
          normalizedSupplierNif,
          payload.supplierEmail || null,
          payload.supplierPhone || null,
          payload.paymentTermsDays || 30
        ]);
        supplierId = supplier.rows[0].id;
        await audit(client, req, 'upsert', 'suppliers', supplierId, null, supplier.rows[0]);
      }

      const invoice = await client.query(`
        insert into purchase_invoices (
          supplier_id, supplier_name, supplier_nif,
          customer_name, customer_nif, restaurant_profile_id, restaurant_match_status, restaurant_match_notes,
          doc_number, total_amount,
          date_issued, due_date, status, paid_amount, photo_url,
          primary_archive_document_id, has_qr_code, has_atcud, atcud,
          image_quality_ok, is_missing_pages,
          qr_code_text, qr_total_amount, calculated_lines_total, total_validation_status, total_validation_notes,
          compliance_notes, expense_category
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, coalesce($11, current_date), $12, coalesce($13::invoice_status, 'PENDENTE'::invoice_status), coalesce($14, 0), $15,
          $16, $17, $18, $19, $20, $21,
          $22, $23, $24, $25, $26,
          $27, $28
        )
        on conflict (supplier_nif, doc_number) do nothing
        returning *
      `, [
        supplierId, payload.supplierName, onlyDigits(payload.supplierNif),
        restaurantValidation.customerName, restaurantValidation.customerNif, restaurantValidation.profileId,
        restaurantValidation.status, restaurantValidation.notes,
        payload.docNumber, payload.totalAmount,
        payload.dateIssued, payload.dueDate, payload.status, payload.paidAmount, payload.photoUrl,
        payload.primaryArchiveDocumentId, payload.hasQrCode, payload.hasAtcud, payload.atcud,
        payload.imageQualityOk, payload.isMissingPages,
        payload.qrCodeText, payload.qrTotalAmount, payload.calculatedLinesTotal, totalValidation.status, totalValidation.notes || null,
        payload.complianceNotes, payload.expenseCategory || null
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
          set invoice_id = $1, supplier_id = coalesce($2, supplier_id)
          where id = $3
          returning *
        `, [invoiceId, supplierId, archiveDocumentId]);
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

        const productBefore = await client.query('select * from products where id = $1 for update', [line.productId]);
        const product = productBefore.rows[0];
        if (product) {
          const currentStock = Number(product.current_stock || 0);
          const averagePrice = Number(product.average_price || 0);
          const quantityStock = Number(line.quantityStock || 0);
          const unitPrice = Number(line.unitPrice || 0);
          const currentValue = currentStock * averagePrice;
          const incomingValue = Number(line.quantityOriginal || 0) * unitPrice;
          const totalStock = currentStock + quantityStock;
          const newAveragePrice = totalStock > 0 ? (currentValue + incomingValue) / totalStock : unitPrice;

          const productAfter = await client.query(`
            update products
            set current_stock = $1, average_price = $2
            where id = $3
            returning *
          `, [totalStock, newAveragePrice, line.productId]);
          await audit(client, req, 'update_stock', 'products', line.productId, product, productAfter.rows[0]);
        }

        if (line.originalName && line.productId) {
          const alias = await client.query(`
            insert into product_aliases (
              supplier_id, product_id, supplier_item_name, supplier_item_code,
              supplier_unit, product_unit, conversion_factor, confidence, last_seen_at
            )
            values ($1, $2, $3, $4, $5, $6, coalesce($7, 1), coalesce($8, 100), now())
            on conflict (supplier_id, normalized_supplier_item_name, coalesce(supplier_item_code, '')) do update set
              product_id = excluded.product_id,
              supplier_unit = excluded.supplier_unit,
              product_unit = excluded.product_unit,
              conversion_factor = excluded.conversion_factor,
              confidence = excluded.confidence,
              last_seen_at = now()
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
            await client.query(`
              insert into product_unit_conversions (product_id, supplier_id, from_unit, to_unit, factor, notes)
              values ($1, $2, $3, $4, coalesce($5, 1), $6)
              on conflict (product_id, coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), from_unit, to_unit)
              do update set factor = excluded.factor, notes = excluded.notes
            `, [
              line.productId,
              supplierId,
              line.unitOriginal,
              line.unitStock,
              line.conversionFactor || 1,
              `Aprendido via fatura ${payload.docNumber || ''}`
            ]);
          }
        }

        await client.query(`
          insert into movements (product_id, invoice_line_id, type, quantity, price, supplier_id, supplier_name, notes)
          values ($1, $2, 'ENTRADA'::movement_type, $3, $4, $5, $6, $7)
        `, [
          line.productId,
          lineResult.rows[0].id,
          line.quantityStock,
          line.unitPrice,
          supplierId,
          payload.supplierName,
          isCredit
            ? `Nota de Crédito ${payload.docNumber || ''}`
            : `Entrada via Fatura ${payload.docNumber || ''}`
        ]);
      }

      await audit(client, req, 'create', 'purchase_invoices', invoiceId, null, { ...invoice.rows[0], lines });
      if (config.invoiceOkEmailTo) {
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
        await sendTrackedEmail(client, req, {
          recipient: config.invoiceOkEmailTo,
          subject: `Fatura registada: ${payload.docNumber || 'S/N'} - ${payload.supplierName || 'Fornecedor'}`,
          body: [
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
          ].join('\n'),
          attachments: invoiceAttachments,
          relatedEntityTable: 'purchase_invoices',
          relatedEntityId: invoiceId
        });
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
