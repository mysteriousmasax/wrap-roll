import bcrypt from 'bcryptjs';

export async function hashPin(pin) {
  return bcrypt.hash(String(pin), 10);
}

export async function verifyPin(pin, stored) {
  const storedValue = String(stored ?? '').trim();
  if (!storedValue) {
    return false;
  }
  if (storedValue.startsWith('$2')) {
    return bcrypt.compare(String(pin), storedValue);
  }
  return String(pin) === storedValue;
}

export async function migratePlaintextPins(db) {
  const users = db.prepare('SELECT id, pin FROM users').all();
  for (const user of users) {
    if (user.pin && !user.pin.startsWith('$2')) {
      const hashed = await hashPin(user.pin);
      db.prepare('UPDATE users SET pin = ? WHERE id = ?').run(hashed, user.id);
    }
  }
}

export async function migrateUserCredentials(db) {
  const users = db.prepare('SELECT id, name, pin, username, password FROM users').all();
  const update = db.prepare('UPDATE users SET username = ?, password = ? WHERE id = ?');
  for (const user of users) {
    const username = user.username || user.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
    update.run(username, user.password || user.pin, user.id);
  }
}
