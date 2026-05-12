import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { pool } from './db.js';
import { productsRouter } from './routes/products.js';
import { suppliersRouter } from './routes/suppliers.js';
import { aliasesRouter } from './routes/aliases.js';
import { invoicesRouter } from './routes/invoices.js';
import { archiveRouter } from './routes/archive.js';
import { authRouter } from './routes/auth.js';
import { conversionsRouter } from './routes/conversions.js';
import { movementsRouter } from './routes/movements.js';
import { paymentsRouter } from './routes/payments.js';
import { reportsRouter } from './routes/reports.js';
import { emailsRouter } from './routes/emails.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

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

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
});

export const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`GestoResto API on http://0.0.0.0:${config.port}`);
});
server.ref();
