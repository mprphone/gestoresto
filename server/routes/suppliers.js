import { Router } from 'express';
import { query } from '../db.js';
import { pageRange, pageResult } from '../pagination.js';

export const suppliersRouter = Router();

suppliersRouter.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, limit, offset } = pageRange(req);
    const result = await query(`
      select id, name, nif, email, phone, payment_terms_days, notes
      from suppliers
      order by name asc
      limit $1 offset $2
    `, [limit, offset]);
    const count = await query('select count(*) from suppliers');
    res.json(pageResult(result.rows, count.rows[0].count, page, pageSize));
  } catch (error) {
    next(error);
  }
});

suppliersRouter.post('/', async (req, res, next) => {
  try {
    const supplier = req.body;
    const result = await query(`
      insert into suppliers (id, name, nif, email, phone, payment_terms_days, notes)
      values (coalesce($1, gen_random_uuid()), $2, $3, $4, $5, coalesce($6, 30), $7)
      on conflict (nif) do update set
        name = excluded.name,
        email = excluded.email,
        phone = excluded.phone,
        payment_terms_days = excluded.payment_terms_days,
        notes = excluded.notes
      returning *
    `, [supplier.id, supplier.name, supplier.nif, supplier.email, supplier.phone, supplier.paymentTermsDays, supplier.notes]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
