import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

export const config = {
  port: Number(process.env.API_PORT || 8790),
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-05-20',
  databaseUrl: process.env.DATABASE_URL || '',
  databaseName: process.env.PGDATABASE || 'gestoresto',
  databaseUser: process.env.PGUSER || process.env.USER || 'ubuntu',
  databaseHost: process.env.PGHOST || '/var/run/postgresql',
  archiveRoot: process.env.ARCHIVE_ROOT || '/mnt/bunker/resto',
  invoiceOkEmailTo: process.env.INVOICE_OK_EMAIL_TO || 'geral@mrebelo.com',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || ''
  },
  imap: {
    host: process.env.IMAP_HOST || '',
    port: Number(process.env.IMAP_PORT || 993),
    secure: process.env.IMAP_SECURE !== 'false',
    user: process.env.IMAP_USER || '',
    pass: process.env.IMAP_PASS || '',
    mailbox: process.env.IMAP_MAILBOX || 'INBOX'
  }
};
