import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { ensureDatabase } from './db/database.js';
import { initWebSocket } from './ws.js';

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

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../dist');
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.hostname.endsWith('.trycloudflare.com');
  } catch {
    return false;
  }
};

await ensureDatabase();

const app = express();
const server = createServer(app);

app.set('trust proxy', 1);
app.use(cors({ origin: (origin, callback) => callback(null, isAllowedOrigin(origin)), credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

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

app.use(express.static(clientDist, { index: false, setHeaders: (res, filePath) => {
  if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store');
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

const httpServer = server.listen(PORT, HOST, () => {
  console.log(`Wrap & Roll POS running on http://${HOST}:${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  httpServer.close(() => process.exit(0));
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
