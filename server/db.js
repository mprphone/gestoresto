import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  ...(config.databaseUrl
    ? { connectionString: config.databaseUrl }
    : {
        database: config.databaseName,
        user: config.databaseUser,
        host: config.databaseHost
      })
});

export async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result;
}

export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
