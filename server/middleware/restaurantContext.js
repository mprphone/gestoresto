import { query } from '../db.js';

/**
 * Reads X-User-Id and X-Restaurant-Id headers, validates the user has access
 * to the requested restaurant, and injects req.userId / req.restaurantId /
 * req.companyId into every request.
 *
 * Routes that don't need restaurant context (auth, health) skip this middleware.
 */
export async function requireRestaurantContext(req, res, next) {
  const userId       = req.headers['x-user-id'];
  const restaurantId = req.headers['x-restaurant-id'];

  if (!userId || !restaurantId) {
    return res.status(401).json({ error: 'Restaurante ativo obrigatório.' });
  }

  try {
    const result = await query(`
      select ura.company_id, ura.role, r.name as restaurant_name, r.notification_emails
      from user_restaurant_access ura
      join restaurants r on r.id = ura.restaurant_id
      where ura.user_id = $1
        and ura.restaurant_id = $2
        and ura.is_active = true
        and r.is_active = true
    `, [userId, restaurantId]);

    if (!result.rows[0]) {
      return res.status(403).json({ error: 'Sem acesso a este restaurante.' });
    }

    req.userId           = userId;
    req.restaurantId     = restaurantId;
    req.companyId        = result.rows[0].company_id;
    req.restaurantName   = result.rows[0].restaurant_name;
    req.restaurantEmails = result.rows[0].notification_emails || [];
    next();
  } catch (error) {
    next(error);
  }
}
