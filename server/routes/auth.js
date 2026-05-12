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
      returning id, name, email, role
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
      select id, name, email, role, password_hash
      from app_users
      where lower(email) = lower($1) and is_active = true
    `, [email]);
    const user = result.rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'invalid credentials' });
      return;
    }
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (error) {
    next(error);
  }
});
