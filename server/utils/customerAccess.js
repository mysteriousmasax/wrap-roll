import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';

const CODE_TTL_MS = 10 * 60 * 1000;
const REQUEST_COOLDOWN_MS = 60 * 1000;
const IP_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_IP = 8;

function normalizeIdentifier(value) {
  const raw = String(value || '').trim();
  if (raw.includes('@')) return `email:${raw.toLowerCase()}`;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 8 ? `phone:${digits.slice(-9)}` : '';
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function createCustomerAccessService({
  findCustomer,
  deliverCode,
  getSecret = () => process.env.JWT_SECRET,
  now = () => Date.now(),
  makeCode = () => String(randomInt(0, 1000000)).padStart(6, '0'),
} = {}) {
  const challenges = new Map();
  const lastRequests = new Map();
  const ipWindows = new Map();

  const prune = () => {
    const timestamp = now();
    for (const [key, challenge] of challenges) if (challenge.expiresAt <= timestamp) challenges.delete(key);
    for (const [key, requestedAt] of lastRequests) if (requestedAt + REQUEST_COOLDOWN_MS <= timestamp) lastRequests.delete(key);
    for (const [key, window] of ipWindows) if (window.startedAt + IP_WINDOW_MS <= timestamp) ipWindows.delete(key);
  };

  const genericResponse = { accepted: true, message: 'If a matching profile has an email address on file, a verification code has been sent.' };

  return {
    async requestCode(identifier, ipAddress = '') {
      prune();
      const key = normalizeIdentifier(identifier);
      if (!key) return genericResponse;

      const ipKey = String(ipAddress || 'unknown');
      const window = ipWindows.get(ipKey) || { startedAt: now(), count: 0 };
      if (window.startedAt + IP_WINDOW_MS <= now()) {
        window.startedAt = now();
        window.count = 0;
      }
      if (window.count >= MAX_REQUESTS_PER_IP) return genericResponse;
      window.count += 1;
      ipWindows.set(ipKey, window);

      const lastRequestedAt = lastRequests.get(key);
      if (lastRequestedAt !== undefined && now() - lastRequestedAt < REQUEST_COOLDOWN_MS) return genericResponse;
      lastRequests.set(key, now());

      const customer = await findCustomer(identifier);
      if (!customer?.id || !customer.email) return genericResponse;

      const code = makeCode();
      challenges.set(key, { customerId: Number(customer.id), codeHash: hash(code), expiresAt: now() + CODE_TTL_MS, attempts: 0 });
      try {
        await deliverCode(customer.email, code);
      } catch (error) {
        challenges.delete(key);
        throw error;
      }
      return genericResponse;
    },

    verifyCode(identifier, code) {
      prune();
      const key = normalizeIdentifier(identifier);
      const challenge = challenges.get(key);
      if (!challenge || challenge.expiresAt <= now()) return { ok: false, error: 'That code is invalid or expired.' };

      challenge.attempts += 1;
      const expected = Buffer.from(challenge.codeHash, 'hex');
      const received = Buffer.from(hash(String(code || '').trim()), 'hex');
      if (challenge.attempts > 5 || expected.length !== received.length || !timingSafeEqual(expected, received)) {
        if (challenge.attempts >= 5) challenges.delete(key);
        return { ok: false, error: 'That code is invalid or expired.' };
      }

      challenges.delete(key);
      const secret = getSecret();
      if (!secret) return { ok: false, error: 'Customer sign-in is temporarily unavailable.' };
      const token = jwt.sign({ sub: String(challenge.customerId), scope: 'public_customer' }, secret, { expiresIn: '30d' });
      return { ok: true, token, customerId: challenge.customerId };
    },

    customerIdFromSession(token) {
      try {
        const payload = jwt.verify(String(token || ''), getSecret());
        if (payload.scope !== 'public_customer') return null;
        const customerId = Number(payload.sub);
        return Number.isSafeInteger(customerId) && customerId > 0 ? customerId : null;
      } catch {
        return null;
      }
    },
  };
}