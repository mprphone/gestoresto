import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { pageRange, pageResult } from '../pagination.js';
import { audit } from '../audit.js';

export const invoicesRouter = Router();

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
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
      const restaurantValidation = await validateRestaurantCustomer(client, payload);
      let supplierId = payload.supplierId || null;
      if (!supplierId && payload.supplierNif) {
        const supplier = await client.query(`
          insert into suppliers (name, nif, email, phone, payment_terms_days)
          values ($1, $2, $3, $4, coalesce($5, 30))
          on conflict (nif) do update set
            name = excluded.name,
            email = coalesce(excluded.email, suppliers.email),
            phone = coalesce(excluded.phone, suppliers.phone)
          returning *
        `, [
          payload.supplierName || 'Fornecedor',
          payload.supplierNif,
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
          image_quality_ok, is_missing_pages, compliance_notes
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, coalesce($11, current_date), $12, coalesce($13, 'PENDENTE'), coalesce($14, 0), $15,
          $16, $17, $18, $19, $20, $21, $22
        )
        on conflict (supplier_nif, doc_number) do nothing
        returning *
      `, [
        supplierId, payload.supplierName, payload.supplierNif,
        restaurantValidation.customerName, restaurantValidation.customerNif, restaurantValidation.profileId,
        restaurantValidation.status, restaurantValidation.notes,
        payload.docNumber, payload.totalAmount,
        payload.dateIssued, payload.dueDate, payload.status, payload.paidAmount, payload.photoUrl,
        payload.primaryArchiveDocumentId, payload.hasQrCode, payload.hasAtcud, payload.atcud,
        payload.imageQualityOk, payload.isMissingPages, payload.complianceNotes
      ]);

      if (!invoice.rows[0]) {
        const error = new Error('Fatura duplicada para este fornecedor');
        error.statusCode = 409;
        throw error;
      }

      const invoiceId = invoice.rows[0].id;
      let archiveDocument = null;
      if (payload.archiveDocumentId) {
        const archive = await client.query(`
          update digital_archive_documents
          set invoice_id = $1, supplier_id = coalesce($2, supplier_id)
          where id = $3
          returning *
        `, [invoiceId, supplierId, payload.archiveDocumentId]);
        archiveDocument = archive.rows[0] || null;
        if (archiveDocument) {
          await client.query(`
            update purchase_invoices
            set primary_archive_document_id = $1, photo_url = coalesce($2, photo_url)
            where id = $3
          `, [archiveDocument.id, archiveDocument.public_url, invoiceId]);
        }
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
          values ($1, $2, 'ENTRADA', $3, $4, $5, $6, $7)
        `, [
          line.productId,
          lineResult.rows[0].id,
          line.quantityStock,
          line.unitPrice,
          supplierId,
          payload.supplierName,
          `Entrada via Fatura ${payload.docNumber || ''}`
        ]);
      }

      await audit(client, req, 'create', 'purchase_invoices', invoiceId, null, { ...invoice.rows[0], lines });
      return { invoice: invoice.rows[0], lines, archiveDocument };
    });
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
});
