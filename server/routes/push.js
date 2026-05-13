import { Router } from 'express';
import { query } from '../db.js';
import { vapidPublicKey } from '../pushService.js';

export const pushRouter = Router();

// Return VAPID public key so the browser can subscribe
pushRouter.get('/vapid-public-key', (_req, res) => {
  res.json({ publicKey: vapidPublicKey() });
});

// Save a push subscription for the current user
pushRouter.post('/subscribe', async (req, res, next) => {
  try {
    const { subscription, userId } = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'subscription inválida' });
    }

    await query(`
      insert into push_subscriptions (user_id, endpoint, p256dh, auth)
      values ($1, $2, $3, $4)
      on conflict (endpoint) do update
        set user_id = excluded.user_id,
            p256dh  = excluded.p256dh,
            auth    = excluded.auth
    `, [userId || null, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]);

    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Remove subscription (logout / permission revoked)
pushRouter.delete('/subscribe', async (req, res, next) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) await query('delete from push_subscriptions where endpoint = $1', [endpoint]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
