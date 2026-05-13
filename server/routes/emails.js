import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { sendTrackedEmail } from '../emailService.js';

export const emailsRouter = Router();

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

    const saved = await withTransaction(async client => sendTrackedEmail(client, req, {
      recipient,
      subject,
      body,
      relatedEntityTable,
      relatedEntityId
    }));

    res.status(saved.status === 'FALHOU' ? 502 : 201).json(saved);
  } catch (error) {
    next(error);
  }
});
