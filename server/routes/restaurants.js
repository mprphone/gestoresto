import { Router } from 'express';
import { query } from '../db.js';

export const restaurantsRouter = Router();

// GET /api/restaurants?userId=X — restaurants the user can access
restaurantsRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.query.userId || req.headers['x-user-id'];
    if (!userId) {
      // Admin: list all restaurants
      const result = await query(`
        select r.*, c.name as company_name
        from restaurants r
        join companies c on c.id = r.company_id
        where r.is_active = true
        order by c.name asc, r.name asc
      `);
      return res.json({ data: result.rows });
    }
    const result = await query(`
      select r.id, r.name, r.nif, r.company_id, c.name as company_name,
             r.legal_name, r.email, r.phone, r.address, r.postal_code, r.city,
             r.notification_emails, r.is_active,
             ura.role as user_role
      from user_restaurant_access ura
      join restaurants r on r.id = ura.restaurant_id
      join companies c on c.id = r.company_id
      where ura.user_id = $1
        and ura.is_active = true
        and r.is_active = true
        and c.is_active = true
      order by c.name asc, r.name asc
    `, [userId]);
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/restaurants/:id
restaurantsRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await query(`
      select r.*, c.name as company_name
      from restaurants r
      join companies c on c.id = r.company_id
      where r.id = $1
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Restaurant not found' });
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/restaurants
restaurantsRouter.post('/', async (req, res, next) => {
  try {
    const { companyId, name, nif, legalName, email, phone, address, postalCode, city, country, notificationEmails } = req.body;
    if (!companyId || !name) return res.status(400).json({ error: 'companyId and name are required' });
    const result = await query(`
      insert into restaurants (company_id, name, nif, legal_name, email, phone, address, postal_code, city, country, notification_emails)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10, 'Portugal'), coalesce($11, '{}'))
      returning *
    `, [companyId, name, nif || null, legalName || null, email || null, phone || null, address || null, postalCode || null, city || null, country, notificationEmails || []]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/restaurants/:id
restaurantsRouter.put('/:id', async (req, res, next) => {
  try {
    const { name, nif, legalName, email, phone, address, postalCode, city, country, notificationEmails, isActive } = req.body;
    const result = await query(`
      update restaurants
      set name = coalesce($1, name), nif = $2, legal_name = $3, email = $4, phone = $5,
          address = $6, postal_code = $7, city = $8, country = coalesce($9, country),
          notification_emails = coalesce($10, notification_emails),
          is_active = coalesce($11, is_active), updated_at = now()
      where id = $12
      returning *
    `, [name, nif || null, legalName || null, email || null, phone || null, address || null, postalCode || null, city || null, country, notificationEmails, isActive, req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Restaurant not found' });
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// GET /api/restaurants/:id/users — list users with access
restaurantsRouter.get('/:id/users', async (req, res, next) => {
  try {
    const result = await query(`
      select u.id, u.name, u.email, u.phone, u.role, u.is_active,
             ura.role as access_role, ura.is_active as access_active, ura.id as access_id
      from user_restaurant_access ura
      join app_users u on u.id = ura.user_id
      where ura.restaurant_id = $1
      order by u.name asc
    `, [req.params.id]);
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

// POST /api/restaurants/:id/users — grant access
restaurantsRouter.post('/:id/users', async (req, res, next) => {
  try {
    const { userId, role } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    // Get companyId for this restaurant
    const rRes = await query('select company_id from restaurants where id = $1', [req.params.id]);
    if (!rRes.rows[0]) return res.status(404).json({ error: 'Restaurant not found' });
    const companyId = rRes.rows[0].company_id;

    const result = await query(`
      insert into user_restaurant_access (user_id, company_id, restaurant_id, role)
      values ($1, $2, $3, coalesce($4, 'funcionario'))
      on conflict (user_id, restaurant_id)
        do update set role = excluded.role, is_active = true
      returning *
    `, [userId, companyId, req.params.id, role]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/restaurants/:id/users/:userId — revoke access
restaurantsRouter.delete('/:id/users/:userId', async (req, res, next) => {
  try {
    await query(`
      update user_restaurant_access set is_active = false
      where restaurant_id = $1 and user_id = $2
    `, [req.params.id, req.params.userId]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// GET /api/restaurants/:id/users/available — users NOT yet in this restaurant
restaurantsRouter.get('/:id/users/available', async (req, res, next) => {
  try {
    const result = await query(`
      select id, name, email, role from app_users
      where is_active = true
        and id not in (
          select user_id from user_restaurant_access
          where restaurant_id = $1 and is_active = true
        )
      order by name asc
    `, [req.params.id]);
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});
