import { Router } from 'express';
import { query } from '../db.js';
import { pageRange, pageResult } from '../pagination.js';

export const suppliersRouter = Router();

function normalizeNif(value) {
  return String(value || '').replace(/\D/g, '');
}

suppliersRouter.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, limit, offset } = pageRange(req);
    const result = await query(`
      select id, name, nif, email, phone, payment_terms_days, notes
      from suppliers
      where restaurant_id = $3
      order by name asc
      limit $1 offset $2
    `, [limit, offset, req.restaurantId]);
    const count = await query('select count(*) from suppliers where restaurant_id = $1', [req.restaurantId]);
    res.json(pageResult(result.rows, count.rows[0].count, page, pageSize));
  } catch (error) {
    next(error);
  }
});

suppliersRouter.post('/', async (req, res, next) => {
  try {
    const supplier = req.body;
    const nif = normalizeNif(supplier.nif);
    if (!supplier.name || !nif) {
      res.status(400).json({ error: 'name and nif are required' });
      return;
    }
    const result = await query(`
      insert into suppliers (id, name, nif, email, phone, payment_terms_days, notes, restaurant_id)
      values (coalesce($1, gen_random_uuid()), $2, $3, $4, $5, coalesce($6, 30), $7, $8)
      on conflict (restaurant_id, normalized_nif) where normalized_nif <> '' do update set
        name = excluded.name,
        nif = excluded.nif,
        email = excluded.email,
        phone = excluded.phone,
        payment_terms_days = excluded.payment_terms_days,
        notes = excluded.notes
      returning *
    `, [supplier.id, supplier.name, nif, supplier.email, supplier.phone, supplier.paymentTermsDays, supplier.notes, req.restaurantId]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
