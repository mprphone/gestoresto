import { Router } from 'express';
import nodemailer from 'nodemailer';
import { query, withTransaction } from '../db.js';
import { config } from '../config.js';
import { audit } from '../audit.js';

export const emailsRouter = Router();

function smtpReady() {
  return Boolean(config.smtp.host && config.smtp.from);
}

function transporter() {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined
  });
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
      const created = await client.query(`
        insert into email_messages (recipient, subject, body, status, related_entity_table, related_entity_id)
        values ($1, $2, $3, 'PENDENTE', $4, $5)
        returning *
      `, [recipient, subject, body, relatedEntityTable || null, relatedEntityId || null]);

      let status = 'SIMULADO';
      let providerMessageId = null;
      let errorMessage = null;
      let sentAt = null;

      if (smtpReady()) {
        try {
          const info = await transporter().sendMail({
            from: config.smtp.from,
            to: recipient,
            subject,
            text: body
          });
          status = 'ENVIADO';
          providerMessageId = info.messageId || null;
          sentAt = new Date();
        } catch (error) {
          status = 'FALHOU';
          errorMessage = error.message;
        }
      }

      const updated = await client.query(`
        update email_messages
        set status = $1, provider_message_id = $2, error_message = $3, sent_at = $4
        where id = $5
        returning *
      `, [status, providerMessageId, errorMessage, sentAt, created.rows[0].id]);

      await audit(client, req, 'send_email', 'email_messages', updated.rows[0].id, created.rows[0], updated.rows[0]);
      return updated.rows[0];
    });

    res.status(saved.status === 'FALHOU' ? 502 : 201).json(saved);
  } catch (error) {
    next(error);
  }
});
