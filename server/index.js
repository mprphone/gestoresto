import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { pool } from './db.js';
import { productsRouter } from './routes/products.js';
import { suppliersRouter } from './routes/suppliers.js';
import { aliasesRouter } from './routes/aliases.js';
import { invoicesRouter } from './routes/invoices.js';
import { archiveRouter } from './routes/archive.js';
import { authRouter, ensureDefaultAdminUser } from './routes/auth.js';
import { conversionsRouter } from './routes/conversions.js';
import { movementsRouter } from './routes/movements.js';
import { paymentsRouter } from './routes/payments.js';
import { reportsRouter } from './routes/reports.js';
import { emailsRouter } from './routes/emails.js';
import { restaurantProfileRouter } from './routes/restaurantProfile.js';
import { geminiRouter } from './routes/gemini.js';
import { pushRouter } from './routes/push.js';
import { reviewRouter } from './routes/review.js';
import { companiesRouter } from './routes/companies.js';
import { restaurantsRouter } from './routes/restaurants.js';
import { runMigrations } from './migrate.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '25mb' }));

app.get('/', (_req, res) => {
  res.type('html').send(`
    <!doctype html>
    <html lang="pt">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>GestoResto API</title>
        <style>
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
          main { max-width: 720px; margin: 12vh auto; padding: 32px; background: white; border: 1px solid #e2e8f0; border-radius: 24px; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08); }
          h1 { margin: 0 0 8px; font-size: 32px; }
          p { color: #475569; line-height: 1.6; }
          a { color: #ea580c; font-weight: 700; }
          code { background: #f1f5f9; padding: 3px 6px; border-radius: 8px; }
        </style>
      </head>
      <body>
        <main>
          <h1>GestoResto API</h1>
          <p>A API está online. O frontend público deve ser aberto no Vercel; este domínio serve os dados, arquivos e relatórios.</p>
          <p>Estado: <a href="/api/health"><code>/api/health</code></a></p>
        </main>
      </body>
    </html>
  `);
});

app.get('/api/health', async (_req, res, next) => {
  try {
    const result = await pool.query('select current_database() as database, now() as now');
    res.json({ ok: true, ...result.rows[0], archiveRoot: config.archiveRoot });
  } catch (error) {
    next(error);
  }
});

app.use('/api/products', productsRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/aliases', aliasesRouter);
app.use('/api/conversions', conversionsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/movements', movementsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/archive', archiveRouter);
app.use('/api/auth', authRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/emails', emailsRouter);
app.use('/api/restaurant-profile', restaurantProfileRouter);
app.use('/api/gemini', geminiRouter);
app.use('/api/push', pushRouter);
app.use('/api/review', reviewRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/restaurants', restaurantsRouter);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
});

export const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`GestoResto API on http://0.0.0.0:${config.port}`);
});
server.ref();

ensureDefaultAdminUser().catch(error => {
  console.error('Failed to ensure default admin user', error);
});

runMigrations().catch(error => {
  console.error('Migration error:', error.message);
});

pool.query(`
  alter table restaurant_profile
  add column if not exists notification_emails text[] not null default '{}'
`).catch(() => { /* column may already exist */ });
