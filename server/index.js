import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import db, { ensureDatabase } from './db/database.js';
import { broadcast, initWebSocket } from './ws.js';

import authRoutes from './routes/auth.js';
import menuRoutes from './routes/menu.js';
import orderRoutes from './routes/orders.js';
import tableRoutes from './routes/tables.js';
import customerRoutes from './routes/customers.js';
import staffRoutes from './routes/staff.js';
import inventoryRoutes from './routes/inventory.js';
import settingsRoutes from './routes/settings.js';
import notificationRoutes from './routes/notifications.js';
import analyticsRoutes from './routes/analytics.js';
import chatRoutes from './routes/chat.js';
import paymentRoutes from './routes/payments.js';
import calendarRoutes from './routes/calendar.js';
import loyaltyRoutes from './routes/loyalty.js';
import businessRoutes from './routes/business.js';
import crmIntelligenceRoutes from './routes/crmIntelligence.js';
import printerRoutes from './routes/printer.js';
import desktopRoutes from './routes/desktop.js';
import emailMarketingRoutes from './routes/emailMarketing.js';
import { startPrinterAgent } from './utils/printerAgent.js';
import { checkPostgresConnection } from './db/postgres.js';
import { startEmailMarketingWorker } from './utils/emailAutomationWorker.js';
import { releaseExpiredCleaningTables } from './utils/tableAvailability.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' || process.env.PORT || process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : '127.0.0.1');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = process.env.CLIENT_DIST_PATH || path.resolve(__dirname, '../dist');
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return false;
};

await ensureDatabase();

const app = express();
const server = createServer(app);

app.set('trust proxy', 1);
app.use(cors({ origin: (origin, callback) => callback(null, isAllowedOrigin(origin)), credentials: true }));
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ ok: true, database: 'ready' });
  } catch {
    res.status(503).json({ ok: false, database: 'unavailable' });
  }
});

app.get('/api/health/postgres', async (_req, res) => {
  try {
    const connected = await checkPostgresConnection();
    res.status(connected ? 200 : 503).json({ ok: connected, database: 'postgres' });
  } catch {
    res.status(503).json({ ok: false, database: 'postgres' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/crm-intelligence', crmIntelligenceRoutes);
app.use('/api/printer', printerRoutes);
app.use('/api/desktop', desktopRoutes);
app.use('/api/email-marketing', emailMarketingRoutes);

if (process.env.PRINTER_AGENT_ENABLED === 'true') startPrinterAgent();
startEmailMarketingWorker();

app.use(express.static(clientDist, { index: false, setHeaders: (res, filePath) => {
  // index.html must never be cached so each refresh fetches the newest asset manifest.
  if (filePath.endsWith('index.html')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    return;
  }
  // Vite emits content-hashed filenames under /assets; safe to cache long-term.
  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return;
  }
  // Everything else (icons, logos, manifest) revalidates each load.
  res.setHeader('Cache-Control', 'no-cache');
} }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/ws') return next();
  res.sendFile(path.join(clientDist, 'index.html'), (error) => error && next(error));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

initWebSocket(server);

const tableAvailabilityTimer = setInterval(() => {
  releaseExpiredCleaningTables(db).forEach((table) => {
    broadcast('table:updated', { id: table.id, number: table.number, status: table.status });
  });
}, 30_000);
tableAvailabilityTimer.unref();

const httpServer = server.listen(PORT, HOST, () => {
  console.log(`Wrap & Roll POS running on http://${HOST}:${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  clearInterval(tableAvailabilityTimer);
  httpServer.close(() => process.exit(0));
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
