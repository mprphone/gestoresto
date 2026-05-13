import webpush from 'web-push';
import { config } from './config.js';
import { query } from './db.js';

let configured = false;

function ensureConfigured() {
  if (configured) return;
  if (!config.vapid.publicKey || !config.vapid.privateKey) return;
  webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
  configured = true;
}

export function vapidPublicKey() {
  return config.vapid.publicKey;
}

// Send a push notification to all admin users
export async function notifyAdmins(payload) {
  ensureConfigured();
  if (!configured) return;

  const subs = await query(`
    select ps.endpoint, ps.p256dh, ps.auth
    from push_subscriptions ps
    join app_users u on u.id = ps.user_id
    where u.role = 'admin' or u.role = 'gerente'
  `);

  const message = JSON.stringify(payload);

  for (const sub of subs.rows) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message
      );
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription expired — remove it
        await query('delete from push_subscriptions where endpoint = $1', [sub.endpoint]);
      } else {
        console.error('Push error:', err.message);
      }
    }
  }
}
