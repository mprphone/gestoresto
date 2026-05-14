import { Router } from 'express';
import { query } from '../db.js';
import { pageRange, pageResult } from '../pagination.js';

export const aliasesRouter = Router();

aliasesRouter.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, limit, offset } = pageRange(req);
    const supplierId = req.query.supplierId;
    const params = supplierId ? [supplierId, req.restaurantId, limit, offset] : [req.restaurantId, limit, offset];
    const where = supplierId
      ? 'where pa.supplier_id = $1 and (s.restaurant_id = $2 or p.restaurant_id = $2)'
      : 'where (s.restaurant_id = $1 or p.restaurant_id = $1)';
    const result = await query(`
      select pa.*
      from product_aliases pa
      left join suppliers s on s.id = pa.supplier_id
      join products p on p.id = pa.product_id
      ${where}
      order by last_seen_at desc nulls last, created_at desc
      limit $${supplierId ? 3 : 2} offset $${supplierId ? 4 : 3}
    `, params);
    const count = await query(
      `select count(*)
       from product_aliases pa
       left join suppliers s on s.id = pa.supplier_id
       join products p on p.id = pa.product_id
       ${where}`,
      supplierId ? [supplierId, req.restaurantId] : [req.restaurantId]
    );
    res.json(pageResult(result.rows, count.rows[0].count, page, pageSize));
  } catch (error) {
    next(error);
  }
});

aliasesRouter.post('/', async (req, res, next) => {
  try {
    const alias = req.body;
    const product = await query('select id from products where id = $1 and restaurant_id = $2', [alias.productId, req.restaurantId]);
    if (!product.rows[0]) return res.status(404).json({ error: 'Artigo não encontrado neste restaurante.' });
    if (alias.supplierId) {
      const supplier = await query('select id from suppliers where id = $1 and restaurant_id = $2', [alias.supplierId, req.restaurantId]);
      if (!supplier.rows[0]) return res.status(404).json({ error: 'Fornecedor não encontrado neste restaurante.' });
    }
    const result = await query(`
      insert into product_aliases (
        id, supplier_id, product_id, supplier_item_name, supplier_item_code,
        supplier_unit, product_unit, conversion_factor, confidence, last_seen_at
      )
      values (coalesce($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, coalesce($8, 1), coalesce($9, 100), coalesce($10, now()))
      on conflict (supplier_id, normalized_supplier_item_name, coalesce(supplier_item_code, '')) do update set
        product_id = excluded.product_id,
        supplier_unit = excluded.supplier_unit,
        product_unit = excluded.product_unit,
        conversion_factor = excluded.conversion_factor,
        confidence = excluded.confidence,
        last_seen_at = now()
      returning *
    `, [
      alias.id, alias.supplierId, alias.productId, alias.supplierItemName, alias.supplierItemCode,
      alias.supplierUnit, alias.productUnit, alias.conversionFactor, alias.confidence, alias.lastSeenAt
    ]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
