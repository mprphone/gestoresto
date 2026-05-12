import { Router } from 'express';
import { query } from '../db.js';
import { pageRange, pageResult } from '../pagination.js';

export const conversionsRouter = Router();

conversionsRouter.get('/product', async (req, res, next) => {
  try {
    const { page, pageSize, limit, offset } = pageRange(req);
    const result = await query(`
      select puc.*, p.name as product_name, s.name as supplier_name
      from product_unit_conversions puc
      join products p on p.id = puc.product_id
      left join suppliers s on s.id = puc.supplier_id
      order by p.name asc, s.name asc nulls first, puc.from_unit asc
      limit $1 offset $2
    `, [limit, offset]);
    const count = await query('select count(*) from product_unit_conversions');
    res.json(pageResult(result.rows, count.rows[0].count, page, pageSize));
  } catch (error) {
    next(error);
  }
});

conversionsRouter.post('/product', async (req, res, next) => {
  try {
    const item = req.body;
    const result = await query(`
      insert into product_unit_conversions (id, product_id, supplier_id, from_unit, to_unit, factor, notes)
      values (coalesce($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7)
      on conflict (product_id, coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), from_unit, to_unit)
      do update set factor = excluded.factor, notes = excluded.notes
      returning *
    `, [item.id, item.productId, item.supplierId || null, item.fromUnit, item.toUnit, item.factor, item.notes]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
