import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { pageRange, pageResult } from '../pagination.js';
import { audit } from '../audit.js';
import { notifyAdmins } from '../pushService.js';

export const movementsRouter = Router();

movementsRouter.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, limit, offset } = pageRange(req);
    const result = await query(`
      select *
      from movements
      where restaurant_id = $3
      order by date_moved desc, id desc
      limit $1 offset $2
    `, [limit, offset, req.restaurantId]);
    const count = await query('select count(*) from movements where restaurant_id = $1', [req.restaurantId]);
    res.json(pageResult(result.rows, count.rows[0].count, page, pageSize));
  } catch (error) {
    next(error);
  }
});

movementsRouter.post('/', async (req, res, next) => {
  try {
    const payload = req.body;
    const saved = await withTransaction(async client => {
      const productBefore = await client.query('select * from products where id = $1 and restaurant_id = $2 for update', [payload.productId, req.restaurantId]);
      const product = productBefore.rows[0];
      if (!product) {
        const error = new Error('Artigo não encontrado');
        error.statusCode = 404;
        throw error;
      }

      const factor = payload.type === 'ENTRADA' ? 1 : -1;
      const nextStock = Number(product.current_stock || 0) + (Number(payload.quantity || 0) * factor);
      if (nextStock < 0) {
        const error = new Error('Stock insuficiente');
        error.statusCode = 400;
        throw error;
      }

      const movement = await client.query(`
        insert into movements (restaurant_id, product_id, type, quantity, price, photo_url, notes, supplier_id, supplier_name)
        values ($1, $2, $3::movement_type, $4, $5, $6, $7, $8, $9)
        returning *
      `, [
        req.restaurantId,
        payload.productId,
        payload.type,
        payload.quantity,
        payload.price,
        payload.photoUrl,
        payload.notes,
        payload.supplierId,
        payload.supplierName
      ]);

      const productAfter = await client.query(`
        update products
        set current_stock = $1
        where id = $2 and restaurant_id = $3
        returning *
      `, [nextStock, payload.productId, req.restaurantId]);

      await audit(client, req, 'create', 'movements', movement.rows[0].id, null, movement.rows[0]);
      await audit(client, req, 'update_stock', 'products', payload.productId, product, productAfter.rows[0]);
      return movement.rows[0];
    });
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
});

// POST /api/movements/guia — batch movement (requires admin review + push notification)
movementsRouter.post('/guia', async (req, res, next) => {
  try {
    const { items, movementType, guiaId, userId } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array required' });
    }
    const gid = guiaId || crypto.randomUUID();

    const saved = await withTransaction(async client => {
      const results = [];
      for (const item of items) {
        const productRow = await client.query(
          'select * from products where id = $1 and restaurant_id = $2 for update',
          [item.productId, req.restaurantId]
        );
        const product = productRow.rows[0];
        if (!product) throw Object.assign(new Error(`Artigo não encontrado: ${item.productId}`), { statusCode: 404 });

        const factor = movementType === 'ENTRADA' ? 1 : -1;
        const nextStock = Number(product.current_stock || 0) + (Number(item.quantity || 0) * factor);
        if (nextStock < 0) throw Object.assign(new Error(`Stock insuficiente: ${product.name}`), { statusCode: 400 });

        const mov = await client.query(`
          insert into movements (restaurant_id, product_id, type, quantity, price, photo_url, guia_id, requires_review)
          values ($1, $2, $3::movement_type, $4, $5, $6, $7, true)
          returning *
        `, [req.restaurantId, item.productId, movementType, item.quantity, product.average_price, item.photoUrl || null, gid]);

        await client.query(
          'update products set current_stock = $1 where id = $2 and restaurant_id = $3',
          [nextStock, item.productId, req.restaurantId]
        );
        await audit(client, req, 'create', 'movements', mov.rows[0].id, null, mov.rows[0]);
        results.push({ ...mov.rows[0], product_name: product.name, unit: product.unit });
      }
      return results;
    });

    // Notify admins via push
    const typeLabel = movementType === 'SAIDA' ? 'Saída' : 'Quebra';
    notifyAdmins({
      title: `Nova Guia de ${typeLabel}`,
      body: `${items.length} artigo${items.length !== 1 ? 's' : ''} — aprovação necessária`,
      data: { url: '/review', guiaId: gid }
    }).catch(() => {});

    res.status(201).json({ guiaId: gid, movements: saved });
  } catch (error) {
    next(error);
  }
});
