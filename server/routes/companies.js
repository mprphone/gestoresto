import { Router } from 'express';
import { query } from '../db.js';

export const companiesRouter = Router();

// GET /api/companies — list all (admin only in practice, no middleware here)
companiesRouter.get('/', async (_req, res, next) => {
  try {
    const result = await query(`
      select c.id, c.name, c.nif, c.email, c.phone, c.address, c.postal_code, c.city, c.country, c.is_active,
             count(r.id) as restaurant_count
      from companies c
      left join restaurants r on r.company_id = c.id and r.is_active = true
      where c.is_active = true
      group by c.id
      order by c.name asc
    `);
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

// POST /api/companies — create company
companiesRouter.post('/', async (req, res, next) => {
  try {
    const { name, nif, email, phone, address, postalCode, city, country } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await query(`
      insert into companies (name, nif, email, phone, address, postal_code, city, country)
      values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, 'Portugal'))
      returning *
    `, [name, nif || null, email || null, phone || null, address || null, postalCode || null, city || null, country]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/companies/:id
companiesRouter.put('/:id', async (req, res, next) => {
  try {
    const { name, nif, email, phone, address, postalCode, city, country, isActive } = req.body;
    const result = await query(`
      update companies
      set name = coalesce($1, name), nif = $2, email = $3, phone = $4, address = $5,
          postal_code = $6, city = $7, country = coalesce($8, country),
          is_active = coalesce($9, is_active), updated_at = now()
      where id = $10
      returning *
    `, [name, nif || null, email || null, phone || null, address || null, postalCode || null, city || null, country, isActive, req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Company not found' });
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
