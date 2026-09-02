import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'wrap-roll-pos-secret-key-2026');

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

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
  return jwt.sign(
    { id: user.id, name: user.name, role: user.role, avatar: user.avatar },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Administrator access required' });
    }
    next();
  };
}

export { JWT_SECRET };
