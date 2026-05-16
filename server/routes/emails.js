import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { sendTrackedEmail } from '../emailService.js';

export const emailsRouter = Router();

async function assertRelatedEntityBelongsToRestaurant(client, table, id, restaurantId) {
  if (!id) return;
  if (table === 'purchase_invoices') {
    const result = await client.query('select id from purchase_invoices where id = $1 and restaurant_id = $2', [id, restaurantId]);
    if (result.rows[0]) return;
  } else if (table === 'payments') {
    const result = await client.query(`
      select p.id
      from payments p
      join purchase_invoices pi on pi.id = p.invoice_id
      where p.id = $1 and pi.restaurant_id = $2
    `, [id, restaurantId]);
    if (result.rows[0]) return;
  } else if (table === 'digital_archive_documents') {
    const result = await client.query('select id from digital_archive_documents where id = $1 and restaurant_id = $2', [id, restaurantId]);
    if (result.rows[0]) return;
  } else if (table === 'reports') {
    if (id === 'daily-summary') return;
  } else {
    const error = new Error('Tipo de entidade relacionada inválido.');
    error.status = 400;
    throw error;
  }
  const error = new Error('Entidade relacionada não pertence ao restaurante ativo.');
  error.status = 403;
  throw error;
}

emailsRouter.get('/', async (_req, res, next) => {
  try {
    const result = await query(`
      select id, recipient, subject, status, related_entity_table, related_entity_id,
             provider_message_id, error_message, sent_at, created_at
      from email_messages
      order by created_at desc
      limit 100
    `);
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

emailsRouter.post('/send', async (req, res, next) => {
  try {
    const { recipient, subject, body, relatedEntityTable, relatedEntityId } = req.body;
    if (!recipient || !subject || !body) {
      res.status(400).json({ error: 'recipient, subject and body are required' });
      return;
    }

    const saved = await withTransaction(async client => {
      if (relatedEntityId) {
        await assertRelatedEntityBelongsToRestaurant(client, relatedEntityTable, relatedEntityId, req.restaurantId);
      }
      return sendTrackedEmail(client, req, {
        recipient,
        subject,
        body,
        relatedEntityTable,
        relatedEntityId
      });
    });

    res.status(saved.status === 'FALHOU' ? 502 : 201).json(saved);
  } catch (error) {
    next(error);
  }
});
