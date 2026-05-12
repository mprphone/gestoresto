import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

export const config = {
  port: Number(process.env.API_PORT || 8787),
  databaseUrl: process.env.DATABASE_URL || 'postgresql:///gestoresto',
  archiveRoot: process.env.ARCHIVE_ROOT || '/mnt/bunker/resto'
};
