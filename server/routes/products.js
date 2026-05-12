import { Router } from 'express';
import { query } from '../db.js';
import { pageRange, pageResult } from '../pagination.js';

export const productsRouter = Router();

const productSelect = `
  select id, name, category, unit, current_stock, average_price, min_stock, updated_at
  from products
`;

productsRouter.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, limit, offset } = pageRange(req);
    const params = [limit, offset];
    const result = await query(`
      ${productSelect}
      where is_active = true
      order by category asc, name asc
      limit $1 offset $2
    `, params);
    const count = await query('select count(*) from products where is_active = true');
    res.json(pageResult(result.rows, count.rows[0].count, page, pageSize));
  } catch (error) {
    next(error);
  }
});

productsRouter.post('/', async (req, res, next) => {
  try {
    const product = req.body;
    const result = await query(`
      insert into products (id, name, category, unit, current_stock, average_price, min_stock)
      values (coalesce($1, gen_random_uuid()), $2, $3, $4, coalesce($5, 0), coalesce($6, 0), coalesce($7, 0))
      on conflict (id) do update set
        name = excluded.name,
        category = excluded.category,
        unit = excluded.unit,
        current_stock = excluded.current_stock,
        average_price = excluded.average_price,
        min_stock = excluded.min_stock
      returning *
    `, [product.id, product.name, product.category, product.unit, product.currentStock, product.averagePrice, product.minStock]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
