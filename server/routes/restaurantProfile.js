import { Router } from 'express';
import { query } from '../db.js';

export const restaurantProfileRouter = Router();

restaurantProfileRouter.get('/', async (_req, res, next) => {
  try {
    const result = await query(`
      select *
      from restaurant_profile
      where is_active = true
      order by updated_at desc
      limit 1
    `);
    const row = result.rows[0] || null;
    if (row) {
      row.notificationEmails = row.notification_emails || [];
    }
    res.json({ data: row });
  } catch (error) {
    next(error);
  }
});

restaurantProfileRouter.post('/', async (req, res, next) => {
  try {
    const profile = req.body;
    if (!profile.name || !profile.nif) {
      res.status(400).json({ error: 'name and nif are required' });
      return;
    }

    const notifEmails = Array.isArray(profile.notificationEmails) ? profile.notificationEmails : [];
    const result = await query(`
      insert into restaurant_profile (
        id, name, nif, legal_name, email, phone, address, postal_code, city, country, is_active, notification_emails
      )
      values (
        coalesce($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10, 'Portugal'), true, $11
      )
      on conflict (is_active) where is_active do update set
        name = excluded.name,
        nif = excluded.nif,
        legal_name = excluded.legal_name,
        email = excluded.email,
        phone = excluded.phone,
        address = excluded.address,
        postal_code = excluded.postal_code,
        city = excluded.city,
        country = excluded.country,
        notification_emails = excluded.notification_emails
      returning *
    `, [
      profile.id,
      profile.name,
      String(profile.nif).replace(/\D/g, ''),
      profile.legalName || null,
      profile.email || null,
      profile.phone || null,
      profile.address || null,
      profile.postalCode || null,
      profile.city || null,
      profile.country || 'Portugal',
      notifEmails
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
