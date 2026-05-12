import { Router } from 'express';
import { query } from '../db.js';
import { pageRange, pageResult } from '../pagination.js';

export const aliasesRouter = Router();

aliasesRouter.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, limit, offset } = pageRange(req);
    const supplierId = req.query.supplierId;
    const params = supplierId ? [supplierId, limit, offset] : [limit, offset];
    const where = supplierId ? 'where supplier_id = $1' : '';
    const result = await query(`
      select *
      from product_aliases
      ${where}
      order by last_seen_at desc nulls last, created_at desc
      limit $${supplierId ? 2 : 1} offset $${supplierId ? 3 : 2}
    `, params);
    const count = await query(
      `select count(*) from product_aliases ${where}`,
      supplierId ? [supplierId] : []
    );
    res.json(pageResult(result.rows, count.rows[0].count, page, pageSize));
  } catch (error) {
    next(error);
  }
});

aliasesRouter.post('/', async (req, res, next) => {
  try {
    const alias = req.body;
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
