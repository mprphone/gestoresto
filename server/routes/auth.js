import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db.js';
import { requireRestaurantContext } from '../middleware/restaurantContext.js';

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

async function loadUserRestaurants(userId) {
  const restaurantsRes = await query(`
    select r.id, r.name, r.nif, r.company_id, c.name as company_name,
           r.notification_emails, ura.role as user_role
    from user_restaurant_access ura
    join restaurants r on r.id = ura.restaurant_id
    join companies c on c.id = r.company_id
    where ura.user_id = $1 and ura.is_active = true and r.is_active = true
    order by c.name asc, r.name asc
  `, [userId]);
  return restaurantsRes.rows;
}

async function loadCurrentRestaurantForUser(user) {
  const restaurants = await loadUserRestaurants(user.id);
  const currentRestaurant = user.last_restaurant_id
    ? restaurants.find(r => r.id === user.last_restaurant_id) || null
    : null;
  return { restaurants, currentRestaurant };
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
      select id, name, email, phone, role, password_hash, last_restaurant_id, last_company_id
      from app_users
      where lower(email) = lower($1) and is_active = true
    `, [email]);
    const user = result.rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'invalid credentials' });
      return;
    }

    const { restaurants, currentRestaurant } = await loadCurrentRestaurantForUser(user);

    res.json({
      id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role,
      restaurants,
      currentRestaurant
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/context', async (req, res, next) => {
  try {
    const userId = req.query.userId || req.headers['x-user-id'];
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const result = await query(`
      select id, name, email, phone, role, last_restaurant_id, last_company_id
      from app_users
      where id = $1 and is_active = true
    `, [userId]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'Utilizador não encontrado.' });
    const { restaurants, currentRestaurant } = await loadCurrentRestaurantForUser(user);
    res.json({ restaurants, currentRestaurant });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/users', requireRestaurantContext, async (req, res, next) => {
  try {
    const result = await query(`
      select u.id, u.name, u.email, u.phone, u.role, u.is_active, u.created_at, u.updated_at
      from user_restaurant_access ura
      join app_users u on u.id = ura.user_id
      where ura.restaurant_id = $1
        and ura.is_active = true
      order by u.is_active desc, u.name asc
    `, [req.restaurantId]);
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

// POST /api/auth/switch-restaurant — change active restaurant, persist preference
authRouter.post('/switch-restaurant', async (req, res, next) => {
  try {
    const { userId, restaurantId } = req.body;
    if (!userId || !restaurantId) return res.status(400).json({ error: 'userId and restaurantId are required' });

    const access = await query(`
      select ura.company_id, r.id, r.name, r.nif, c.name as company_name,
             r.notification_emails, ura.role as user_role
      from user_restaurant_access ura
      join restaurants r on r.id = ura.restaurant_id
      join companies c on c.id = r.company_id
      where ura.user_id = $1 and ura.restaurant_id = $2 and ura.is_active = true
    `, [userId, restaurantId]);

    if (!access.rows[0]) return res.status(403).json({ error: 'Sem acesso a este restaurante.' });

    await query(`
      update app_users set last_restaurant_id = $1, last_company_id = $2 where id = $3
    `, [restaurantId, access.rows[0].company_id, userId]);

    res.json({ currentRestaurant: access.rows[0] });
  } catch (error) {
    next(error);
  }
});
