import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db.js';

export const authRouter = Router();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), test);
}

export async function ensureDefaultAdminUser() {
  const existing = await query('select id from app_users where lower(email) = lower($1)', ['mpr@mpr.pt']);
  if (existing.rows[0]) return;
  await query(`
    insert into app_users (name, email, phone, password_hash, role)
    values ($1, $2, $3, $4, 'admin')
  `, ['MPR', 'mpr@mpr.pt', null, hashPassword('1234')]);
}

authRouter.post('/bootstrap', async (req, res, next) => {
  try {
    const count = await query('select count(*) from app_users');
    if (Number(count.rows[0].count) > 0) {
      res.status(409).json({ error: 'users already exist' });
      return;
    }
    const { name = 'Administrador', email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'email and password are required' });
      return;
    }
    const result = await query(`
      insert into app_users (name, email, password_hash, role)
      values ($1, $2, $3, 'admin')
      returning id, name, email, phone, role, is_active
    `, [name, email, hashPassword(password)]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await query(`
      select id, name, email, phone, role, password_hash
      from app_users
      where lower(email) = lower($1) and is_active = true
    `, [email]);
    const user = result.rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'invalid credentials' });
      return;
    }
    res.json({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/users', async (_req, res, next) => {
  try {
    const result = await query(`
      select id, name, email, phone, role, is_active, created_at, updated_at
      from app_users
      order by is_active desc, name asc
    `);
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/users', async (req, res, next) => {
  try {
    const user = req.body;
    if (!user.name || !user.email) {
      res.status(400).json({ error: 'name and email are required' });
      return;
    }

    const role = user.role === 'admin' ? 'admin' : 'funcionario';
    const params = [
      user.id || null,
      user.name,
      user.email,
      user.phone || null,
      role,
      user.isActive !== false
    ];

    let result;
    if (user.password) {
      result = await query(`
        insert into app_users (id, name, email, phone, role, is_active, password_hash)
        values (coalesce($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7)
        on conflict (lower(email)) do update set
          name = excluded.name,
          phone = excluded.phone,
          role = excluded.role,
          is_active = excluded.is_active,
          password_hash = excluded.password_hash
        returning id, name, email, phone, role, is_active, created_at, updated_at
      `, [...params, hashPassword(user.password)]);
    } else {
      result = await query(`
        insert into app_users (id, name, email, phone, role, is_active, password_hash)
        values (coalesce($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7)
        on conflict (lower(email)) do update set
          name = excluded.name,
          phone = excluded.phone,
          role = excluded.role,
          is_active = excluded.is_active
        returning id, name, email, phone, role, is_active, created_at, updated_at
      `, [...params, hashPassword('1234')]);
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
