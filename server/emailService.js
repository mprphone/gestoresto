import nodemailer from 'nodemailer';
import { config } from './config.js';
import { audit } from './audit.js';

export function smtpReady() {
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

export async function sendTrackedEmail(client, req, { recipient, subject, body, attachments = [], relatedEntityTable, relatedEntityId }) {
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
        text: body,
        attachments
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
}
