import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { syncMenuCatalog } from './menu-catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'wraproll.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export async function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      pin TEXT NOT NULL,
      avatar TEXT
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      category TEXT NOT NULL,
      image TEXT,
      prep_time_minutes INTEGER DEFAULT 8,
      popular INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS modifiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL DEFAULT 0,
      type TEXT NOT NULL CHECK(type IN ('add', 'remove'))
    );

    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER NOT NULL UNIQUE,
      seats INTEGER NOT NULL,
      status TEXT DEFAULT 'available',
      x REAL DEFAULT 0,
      y REAL DEFAULT 0,
      current_order_id TEXT,
      reservation TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      tier TEXT DEFAULT 'Regular',
      lifetime_value REAL DEFAULT 0,
      favorite_items TEXT DEFAULT '[]',
      last_visit TEXT,
      phone TEXT,
      email TEXT,
      visits INTEGER DEFAULT 0,
      at_risk INTEGER DEFAULT 0,
      birthday TEXT,
      anniversary TEXT,
      customer_segment TEXT DEFAULT 'regular',
      nfc_tag_code TEXT,
      nfc_tag_type TEXT,
      loyalty_notes TEXT,
      preferred_channel TEXT DEFAULT 'pos'
    );

    CREATE TABLE IF NOT EXISTS loyalty_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      item_type TEXT NOT NULL DEFAULT 'key_holder',
      item_code TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      issue_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS holiday_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      event_date TEXT NOT NULL,
      country TEXT DEFAULT 'GLOBAL',
      region TEXT,
      category TEXT DEFAULT 'holiday',
      source TEXT DEFAULT 'world-feed',
      template TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      role TEXT,
      shift TEXT,
      status TEXT DEFAULT 'off-clock',
      clock_in TEXT,
      avatar TEXT,
      phone TEXT
    );

    CREATE TABLE IF NOT EXISTS shift_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL,
      staff_name TEXT NOT NULL,
      shift_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      hours_worked REAL DEFAULT 0,
      status TEXT DEFAULT 'completed',
      notes TEXT,
      FOREIGN KEY (staff_id) REFERENCES staff(id)
    );

    CREATE TABLE IF NOT EXISTS payroll_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL,
      staff_name TEXT NOT NULL,
      pay_period TEXT NOT NULL,
      basic_pay REAL NOT NULL,
      overtime REAL DEFAULT 0,
      allowances REAL DEFAULT 0,
      deductions REAL DEFAULT 0,
      net_pay REAL NOT NULL,
      status TEXT DEFAULT 'approved',
      created_at TEXT NOT NULL,
      FOREIGN KEY (staff_id) REFERENCES staff(id)
    );

    CREATE TABLE IF NOT EXISTS training_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_name TEXT NOT NULL,
      topic TEXT NOT NULL,
      trainer TEXT,
      training_date TEXT NOT NULL,
      status TEXT DEFAULT 'completed',
      score INTEGER,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS sales_transactions (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      customer_name TEXT,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      channel TEXT DEFAULT 'pos',
      status TEXT DEFAULT 'completed',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT,
      threshold REAL,
      supplier TEXT,
      last_restocked TEXT,
      image_url TEXT,
      category TEXT DEFAULT 'ingredients',
      sku TEXT,
      unit_cost REAL DEFAULT 0,
      expiry_date TEXT,
      storage_location TEXT
    );

    CREATE TABLE IF NOT EXISTS inventory_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('created', 'updated')),
      changed_by_id INTEGER,
      changed_by_name TEXT NOT NULL,
      changed_by_role TEXT,
      changes TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE,
      FOREIGN KEY (changed_by_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_audit_item ON inventory_audit(inventory_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_type TEXT NOT NULL,
      table_number INTEGER,
      customer_name TEXT,
      customer_phone TEXT,
      customer_email TEXT,
      delivery_address TEXT,
      subtotal REAL NOT NULL,
      tax REAL NOT NULL,
      total REAL NOT NULL,
      payment_method TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      staff_id INTEGER,
      FOREIGN KEY (staff_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT,
      actor_user_id INTEGER,
      occurred_at TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id, occurred_at ASC);
    CREATE INDEX IF NOT EXISTS idx_order_events_actor ON order_events(actor_user_id, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      menu_item_id INTEGER,
      name TEXT NOT NULL,
      qty INTEGER NOT NULL,
      price REAL NOT NULL,
      prep_time_minutes INTEGER DEFAULT 8,
      modifiers TEXT DEFAULT '[]',
      special_instructions TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      customer_name TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      sender_type TEXT NOT NULL CHECK(sender_type IN ('customer', 'staff')),
      staff_id INTEGER,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (staff_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sales_monthly (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      revenue REAL NOT NULL,
      orders_count INTEGER NOT NULL,
      profit REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_counter (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      next_id INTEGER DEFAULT 1001
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'TZS',
      payment_method TEXT NOT NULL,
      pesapal_order_id TEXT UNIQUE,
      status TEXT DEFAULT 'initiated',
      initiated_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS refunds (
      id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT,
      pesapal_refund_id TEXT,
      status TEXT DEFAULT 'pending',
      requested_at TEXT NOT NULL,
      processed_at TEXT,
      FOREIGN KEY (payment_id) REFERENCES payments(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
    CREATE INDEX IF NOT EXISTS idx_payments_pesapal ON payments(pesapal_order_id);
    CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(payment_id);
    CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
  `);

  migrateSchema(db);

  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (userCount.c === 0) {
    const { seedDatabase } = await import('./seed.js');
    await seedDatabase(db, { includeLegacyFixtures: false });
  }

  syncMenuCatalog(db);

  const { migratePlaintextPins, migrateUserCredentials } = await import('../utils/pins.js');
  await migratePlaintextPins(db);
  await migrateUserCredentials(db);
}

function migrateSchema(db) {
  const cols = db.prepare('PRAGMA table_info(orders)').all();
  if (cols.length > 0 && !cols.some((c) => c.name === 'delivery_address')) {
    db.exec('ALTER TABLE orders ADD COLUMN delivery_address TEXT');
  }
  const userCols = db.prepare('PRAGMA table_info(users)').all();
  if (!userCols.some((col) => col.name === 'username')) db.exec('ALTER TABLE users ADD COLUMN username TEXT');
  if (!userCols.some((col) => col.name === 'email')) db.exec('ALTER TABLE users ADD COLUMN email TEXT');
  if (!userCols.some((col) => col.name === 'password')) db.exec('ALTER TABLE users ADD COLUMN password TEXT');
  const staffCols = db.prepare('PRAGMA table_info(staff)').all();
  if (!staffCols.some((col) => col.name === 'user_id')) db.exec('ALTER TABLE staff ADD COLUMN user_id INTEGER REFERENCES users(id)');
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT,
      actor_user_id INTEGER,
      occurred_at TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id, occurred_at ASC);
    CREATE INDEX IF NOT EXISTS idx_order_events_actor ON order_events(actor_user_id, occurred_at DESC);
  `);
  db.prepare('UPDATE staff SET user_id = (SELECT id FROM users WHERE users.name = staff.name) WHERE user_id IS NULL').run();

  const tableCols = db.prepare('PRAGMA table_info(tables)').all();
  if (!tableCols.some((col) => col.name === 'tag_id')) db.exec('ALTER TABLE tables ADD COLUMN tag_id TEXT');
  if (!tableCols.some((col) => col.name === 'image_url')) db.exec('ALTER TABLE tables ADD COLUMN image_url TEXT');
  if (!tableCols.some((col) => col.name === 'zone')) db.exec('ALTER TABLE tables ADD COLUMN zone TEXT');
  if (!tableCols.some((col) => col.name === 'note')) db.exec('ALTER TABLE tables ADD COLUMN note TEXT');
  const chatConversationCols = db.prepare('PRAGMA table_info(chat_conversations)').all();
  if (!chatConversationCols.some((col) => col.name === 'customer_phone')) db.exec('ALTER TABLE chat_conversations ADD COLUMN customer_phone TEXT');
  if (!chatConversationCols.some((col) => col.name === 'customer_email')) db.exec('ALTER TABLE chat_conversations ADD COLUMN customer_email TEXT');
  const inventoryCols = db.prepare('PRAGMA table_info(inventory)').all();
  if (!inventoryCols.some((col) => col.name === 'image_url')) db.exec('ALTER TABLE inventory ADD COLUMN image_url TEXT');
  if (!inventoryCols.some((col) => col.name === 'category')) db.exec("ALTER TABLE inventory ADD COLUMN category TEXT DEFAULT 'ingredients'");
  if (!inventoryCols.some((col) => col.name === 'sku')) db.exec('ALTER TABLE inventory ADD COLUMN sku TEXT');
  if (!inventoryCols.some((col) => col.name === 'unit_cost')) db.exec('ALTER TABLE inventory ADD COLUMN unit_cost REAL DEFAULT 0');
  if (!inventoryCols.some((col) => col.name === 'expiry_date')) db.exec('ALTER TABLE inventory ADD COLUMN expiry_date TEXT');
  if (!inventoryCols.some((col) => col.name === 'storage_location')) db.exec('ALTER TABLE inventory ADD COLUMN storage_location TEXT');
  const menuCols = db.prepare('PRAGMA table_info(menu_items)').all();
  if (!menuCols.some((col) => col.name === 'prep_time_minutes')) db.exec('ALTER TABLE menu_items ADD COLUMN prep_time_minutes INTEGER DEFAULT 8');
  const orderItemCols = db.prepare('PRAGMA table_info(order_items)').all();
  if (!orderItemCols.some((col) => col.name === 'prep_time_minutes')) db.exec('ALTER TABLE order_items ADD COLUMN prep_time_minutes INTEGER DEFAULT 8');
  const customerCols = db.prepare('PRAGMA table_info(customers)').all();
  if (!customerCols.some((col) => col.name === 'email')) db.exec('ALTER TABLE customers ADD COLUMN email TEXT');
  if (!customerCols.some((col) => col.name === 'birthday')) db.exec('ALTER TABLE customers ADD COLUMN birthday TEXT');
  if (!customerCols.some((col) => col.name === 'anniversary')) db.exec('ALTER TABLE customers ADD COLUMN anniversary TEXT');
  if (!customerCols.some((col) => col.name === 'customer_segment')) db.exec("ALTER TABLE customers ADD COLUMN customer_segment TEXT DEFAULT 'regular'");
  if (!customerCols.some((col) => col.name === 'nfc_tag_code')) db.exec('ALTER TABLE customers ADD COLUMN nfc_tag_code TEXT');
  if (!customerCols.some((col) => col.name === 'nfc_tag_type')) db.exec('ALTER TABLE customers ADD COLUMN nfc_tag_type TEXT');
  if (!customerCols.some((col) => col.name === 'loyalty_notes')) db.exec('ALTER TABLE customers ADD COLUMN loyalty_notes TEXT');
  if (!customerCols.some((col) => col.name === 'preferred_channel')) db.exec("ALTER TABLE customers ADD COLUMN preferred_channel TEXT DEFAULT 'pos'");

  const holidayCols = db.prepare('PRAGMA table_info(holiday_events)').all();
  if (holidayCols.length === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS holiday_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        event_date TEXT NOT NULL,
        country TEXT DEFAULT 'GLOBAL',
        region TEXT,
        category TEXT DEFAULT 'holiday',
        source TEXT DEFAULT 'world-feed',
        template TEXT,
        active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );
    `);
  }
  const loyaltyCols = db.prepare('PRAGMA table_info(loyalty_items)').all();
  if (loyaltyCols.length === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS loyalty_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        item_type TEXT NOT NULL DEFAULT 'key_holder',
        item_code TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        issue_date TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      );
    `);
  }

  const orderCols = db.prepare('PRAGMA table_info(orders)').all();
  if (!orderCols.some((col) => col.name === 'customer_phone')) db.exec('ALTER TABLE orders ADD COLUMN customer_phone TEXT');
  if (!orderCols.some((col) => col.name === 'customer_email')) db.exec('ALTER TABLE orders ADD COLUMN customer_email TEXT');
  if (!orderCols.some((c) => c.name === 'delivery_scheduled_for')) db.exec('ALTER TABLE orders ADD COLUMN delivery_scheduled_for TEXT');
  if (!orderCols.some((c) => c.name === 'payment_status')) db.exec("ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'unpaid'");
  if (!orderCols.some((c) => c.name === 'order_source')) db.exec("ALTER TABLE orders ADD COLUMN order_source TEXT DEFAULT 'foh'");
  if (!orderCols.some((c) => c.name === 'payment_reference')) db.exec('ALTER TABLE orders ADD COLUMN payment_reference TEXT');
  db.prepare("UPDATE inventory SET image_url = COALESCE(NULLIF(image_url, ''), 'https://images.unsplash.com/photo-1547592180-85f173990554?w=240&h=180&fit=crop'), category = COALESCE(NULLIF(category, ''), 'ingredients'), sku = COALESCE(NULLIF(sku, ''), 'INV-' || printf('%03d', id)), storage_location = COALESCE(NULLIF(storage_location, ''), 'Main store')").run();
}

export async function ensureDatabase() {
  await initDatabase();
}

export default db;
