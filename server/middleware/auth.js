import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { normalizeUserRole } from '../utils/roles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretPath = path.resolve(__dirname, '../db/pos-jwt-secret.txt');
  try {
    if (fs.existsSync(secretPath)) {
      const existing = fs.readFileSync(secretPath, 'utf8').trim();
      if (existing) return existing;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    try {
      fs.mkdirSync(path.dirname(secretPath), { recursive: true });
      fs.writeFileSync(secretPath, generated, 'utf8');
    } catch {}
    return generated;
  } catch {
    return 'wrap-roll-pos-secret-key-2026';
  }
}

const JWT_SECRET = getJwtSecret();

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function signToken(user) {
  const role = normalizeUserRole(user.role);
  const pageAccess = Array.isArray(user.pageAccess) ? user.pageAccess : (Array.isArray(user.page_access) ? user.page_access : []);
  return jwt.sign(
    { id: user.id, name: user.name, role, avatar: user.avatar, pageAccess },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

export function requireRole(...roles) {
  return (req, res, next) => {
    const userRole = req.user ? normalizeUserRole(req.user.role) : null;
    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({ error: 'Administrator access required' });
    }
    next();
  };
}

export { JWT_SECRET };
