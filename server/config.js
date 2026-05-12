import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

export const config = {
  port: Number(process.env.API_PORT || 8790),
  databaseUrl: process.env.DATABASE_URL || '',
  databaseName: process.env.PGDATABASE || 'gestoresto',
  databaseUser: process.env.PGUSER || process.env.USER || 'ubuntu',
  databaseHost: process.env.PGHOST || '/var/run/postgresql',
  archiveRoot: process.env.ARCHIVE_ROOT || '/mnt/bunker/resto',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || ''
  }
};
