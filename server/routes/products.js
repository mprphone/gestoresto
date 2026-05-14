import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { pageRange, pageResult } from '../pagination.js';
import { audit } from '../audit.js';

export const productsRouter = Router();

const productSelect = `
  select id, name, category, unit, current_stock, average_price, min_stock, updated_at
  from products
`;

productsRouter.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, limit, offset } = pageRange(req);
    const restaurantId = req.headers['x-restaurant-id'] || null;
    const filter = restaurantId ? 'and (restaurant_id = $3 or restaurant_id is null)' : '';
    const params = restaurantId ? [limit, offset, restaurantId] : [limit, offset];
    const result = await query(`
      ${productSelect}
      where is_active = true ${filter}
      order by category asc, name asc
      limit $1 offset $2
    `, params);
    const countParams = restaurantId ? [restaurantId] : [];
    const countFilter = restaurantId ? 'and (restaurant_id = $1 or restaurant_id is null)' : '';
    const count = await query(`select count(*) from products where is_active = true ${countFilter}`, countParams);
    res.json(pageResult(result.rows, count.rows[0].count, page, pageSize));
  } catch (error) {
    next(error);
  }
});

productsRouter.post('/', async (req, res, next) => {
  try {
    const product = req.body;
    const existing = await query(`
      select *
      from products
      where normalized_name = normalize_search_text($1)
        and unit = $2
        and ($3::uuid is null or id <> $3::uuid)
        and is_active = true
      limit 1
    `, [product.name, product.unit, product.id || null]);
    if (existing.rows[0]) {
      res.status(200).json(existing.rows[0]);
      return;
    }

    const restaurantId = req.headers['x-restaurant-id'] || null;
    const result = await query(`
      insert into products (id, name, category, unit, current_stock, average_price, min_stock, restaurant_id)
      values (coalesce($1, gen_random_uuid()), $2, $3, $4, coalesce($5, 0), coalesce($6, 0), coalesce($7, 0), $8)
      on conflict (id) do update set
        name = excluded.name,
        category = excluded.category,
        unit = excluded.unit,
        current_stock = excluded.current_stock,
        average_price = excluded.average_price,
        min_stock = excluded.min_stock
      returning *
    `, [product.id, product.name, product.category, product.unit, product.currentStock, product.averagePrice, product.minStock, restaurantId]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

productsRouter.delete('/:id', async (req, res, next) => {
  try {
    const result = await withTransaction(async client => {
      const before = await client.query('select * from products where id = $1', [req.params.id]);
      const after = await client.query('update products set is_active = false where id = $1 returning *', [req.params.id]);
      await audit(client, req, 'deactivate', 'products', req.params.id, before.rows[0] || null, after.rows[0] || null);
      return after.rows[0];
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});
