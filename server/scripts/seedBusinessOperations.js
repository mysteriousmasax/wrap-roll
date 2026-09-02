import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new DatabaseSync(path.resolve(__dirname, '../db/wraproll.db'));

const inventoryRows = [
  ['Mayonnaise', 1050, 'mL', 1900, 'My Vendor', '2025-08-21', '', 'sauces', '946mL', 9000, '', 'MISC TZ Location'],
  ['TEST ITEM', 0, 'gram', 10, 'Wrap & Roll', '2025-08-21', '', 'inventory', '100grams', 1000, '', 'Mikocheni'],
  ['Americano Black', -5, 'Each', 10, 'Coffee Menu', '2025-08-21', '', 'coffee', 'Each', 0, '', 'Mikocheni'],
  ['Tea Bags', 0, 'satchet', 50, 'My Vendor', '2025-08-21', '', 'coffee', '25 tea satchets', 3500, '', 'MISC TZ Location'],
  ['Large Soda, 1.2L', 0, 'unit', 10, 'Pepsi/CocaCola', '2025-08-21', '', 'soft drinks', '12x pack,1.2L', 4000, '', 'Coca Cola/Pepsi Bottler'],
  ['Medium Soda, 600mL', 0, 'unit', 10, 'Pepsi/CocaCola', '2025-08-21', '', 'soft drinks', '12x pack, 600mL', 2000, '', 'Coca Cola/Pepsi Bottler'],
  ['Small Soda, 300mL', 0, 'unit', 10, 'My Vendor', '2025-08-21', '', 'soft drinks', '12xpack, 300mL', 1000, '', 'Coca Cola/Pepsi Bottler'],
  ['BBQ Chicken', -2.1, 'grams', 1, 'My Vendor', '2025-08-21', '', 'meats & dairy', '1kg', 16000, '', 'MISC TZ Location'],
  ['Cheddar Cheese', -2127, 'gram', 1, 'My Vendor', '2025-08-21', '', 'meats & dairy', '1 kg', 30000, '', 'MISC TZ Location'],
  ['Chicken Strips', -388.15, 'kg', 3, 'My Vendor', '2025-08-21', '', 'meats & dairy', '1kg', 15000, '', 'MISC TZ Location'],
  ['Milk', 0, 'mL', 1000, 'My Vendor', '2025-08-21', '', 'meats & dairy', '500mL', 15500, '', 'MISC TZ Location'],
  ['Minced Beef Burger', -10.4, 'kg', 1, 'My Vendor', '2025-08-21', '', 'meats & dairy', '1 kg', 14000, '', 'MISC TZ Location'],
  ['Minced Chicken Burger', -602, 'gram', 1000, 'My Vendor', '2025-08-21', '', 'meats & dairy', '500g', 14000, '', 'MISC TZ Location'],
  ['Mozarella Cheese', -78, 'gram', 1, 'My Vendor', '2025-08-21', '', 'meats & dairy', '1 kg', 22000, '', 'MISC TZ Location'],
  ['Pastrami', -22, 'grams', 1000, 'My Vendor', '2025-08-21', '', 'meats & dairy', '500', 22000, '', 'MISC TZ Location'],
  ['Prestige Butter', 0, 'gram', 500, 'My Vendor', '2025-08-21', '', 'meats & dairy', '250grams', 5000, '', 'MISC TZ Location'],
  ['Sausage', -784, 'gram', 1, 'My Vendor', '2025-08-21', '', 'meats & dairy', '1kg', 8000, '', 'MISC TZ Location'],
  ['Sliced Cheddar Cheese', -133.6, 'gram', 800, 'My Vendor', '2025-08-21', '', 'meats & dairy', '400grams', 12000, '', 'MISC TZ Location'],
  ['Smoked Beef', -71, 'gram', 1000, 'My Vendor', '2025-08-21', '', 'meats & dairy', '500grams', 20000, '', 'MISC TZ Location'],
  ['Steak', -375, 'gram', 3, 'My Vendor', '2025-08-21', '', 'meats & dairy', '1kg', 14000, '', 'MISC TZ Location'],
  ['Strawberry Ice Cream', 0, 'mL', 10, 'My Vendor', '2025-08-21', '', 'meats & dairy', '5L', 35000, '', 'MISC TZ Location'],
  ['Sweet Chicken', 0, 'grams', 1, 'My Vendor', '2025-08-21', '', 'meats & dairy', '1 kg', 17000, '', 'MISC TZ Location'],
  ['Tikka (Tandoori)', -718, 'grams', 1, 'My Vendor', '2025-08-21', '', 'meats & dairy', '1 kg', 16000, '', 'MISC TZ Location'],
  ['Tuna', -6, 'gram', 260, 'My Vendor', '2025-08-21', '', 'meats & dairy', '130', 4100, '', 'MISC TZ Location'],
  ['Vanilla Ice Cream', 0, 'mL', 10, 'My Vendor', '2025-08-21', '', 'meats & dairy', '5L', 30000, '', 'MISC TZ Location'],
  ['Yoghurt', 0, 'mL', 1000, 'My Vendor', '2025-08-21', '', 'meats & dairy', '500mL', 1700, '', 'MISC TZ Location'],
  ['BBQ Sauce', -810, 'mL', 1050, 'My Vendor', '2025-08-21', '', 'sauces', '525mL', 11000, '', 'MISC TZ Location'],
  ['Brown Vinegar', 0, 'mL', 1000, 'My Vendor', '2025-08-21', '', 'sauces', '500mL', 2000, '', 'MISC TZ Location'],
  ['Caramel Sauce', 0, 'gram', 1250, 'My Vendor', '2025-08-21', '', 'sauces', '623grams', 15000, '', 'MISC TZ Location'],
  ['Chocolate Sauce', 0, 'gram', 1250, 'My Vendor', '2025-08-21', '', 'sauces', '624grams', 18000, '', 'MISC TZ Location'],
  ['Honey', 0, 'gram', 1000, 'My Vendor', '2025-08-21', '', 'sauces', '500grams', 10000, '', 'MISC TZ Location'],
  ['Honey Mustard', -750, 'mL', 1000, 'My Vendor', '2025-08-21', '', 'sauces', '946 mL', 9000, '', 'MISC TZ Location'],
  ['Hot Chili Sauce', -720, 'gram', 850, 'My Vendor', '2025-08-21', '', 'sauces', '850grams', 1700, '', 'MISC TZ Location'],
  ['Ketchup Tomato', -1050, 'gram', 2, 'My Vendor', '2025-08-21', '', 'sauces', '1.8kg', 23000, '', 'MISC TZ Location'],
  ['Mustard', -495, 'gram', 800, 'My Vendor', '2025-08-21', '', 'sauces', '391grams', 11000, '', 'MISC TZ Location'],
  ['Olive Oil', -480, 'mL', 500, 'My Vendor', '2025-08-21', '', 'sauces', '250mL', 22000, '', 'MISC TZ Location'],
  ['Pizza Sauce', -975, 'gram', 760, 'My Vendor', '2025-08-21', '', 'sauces', '380grams', 6000, '', 'MISC TZ Location'],
  ['Sweet Onion', 0, 'mL', 1900, 'My Vendor', '2025-08-21', '', 'sauces', '946mL', 8000, '', 'MISC TZ Location'],
  ['Thousand Island', -810, 'mL', 1900, 'My Vendor', '2025-08-21', '', 'sauces', '946mL', 10000, '', 'MISC TZ Location'],
  ['Tomato Satchets', 0, 'gram', 8, 'My Vendor', '2025-08-21', '', 'sauces', '4kg', 38600, '', 'MISC TZ Location'],
  ['Vinegar', -710, 'mL', 960, 'My Vendor', '2025-08-21', '', 'sauces', '473mL', 6000, '', 'MISC TZ Location'],
  ['Avocado', 0, 'each', 5, 'My Vendor', '2025-08-21', '', 'fruits & vegetables', '1', 1500, '', 'MISC TZ Location'],
  ['Carrots', -360, 'gram', 1, 'My Vendor', '2025-08-21', '', 'fruits & vegetables', '1kg', 2000, '', 'MISC TZ Location'],
  ['Cooking Oil Fries', 0, 'mL', 6, 'My Vendor', '2025-08-21', '', 'fruits & vegetables', '3Liters', 26000, '', 'MISC TZ Location'],
  ['Cucumber', -750, 'gram', 2, 'My Vendor', '2025-08-21', '', 'fruits & vegetables', '1kg', 2000, '', 'MISC TZ Location'],
  ['Green Pepper', -1125, 'gram', 2, 'My Vendor', '2025-08-21', '', 'fruits & vegetables', '1kg', 3000, '', 'MISC TZ Location'],
  ['Jalapenos', 0, 'gram', 1300, 'My Vendor', '2025-08-21', '', 'fruits & vegetables', '680grams', 8000, '', 'MISC TZ Location'],
  ['Lemons', 0, 'kg', 5, 'My Vendor', '2025-08-21', '', 'fruits & vegetables', '1', 16000, '', 'MISC TZ Location'],
  ['Lettuce', -970, 'gram', 2, 'My Vendor', '2025-08-21', '', 'fruits & vegetables', '1kg', 3000, '', 'MISC TZ Location'],
  ['Mint', 0, 'gram', 200, 'My Vendor', '2025-08-21', '', 'fruits & vegetables', '100grams', 1000, '', 'MISC TZ Location'],
  ['Mushrooms', 0, 'gram', 800, 'My Vendor', '2025-08-21', '', 'fruits & vegetables', '400grams', 4500, '', 'MISC TZ Location'],
  ['Olives', 0, 'grams', 350, 'My Vendor', '2025-08-21', '', 'fruits & vegetables', '175grams', 5000, '', 'MISC TZ Location'],
  ['Onions', -116.5, 'grams', 2, 'My Vendor', '2025-08-21', '', 'fruits & vegetables', '1kg', 2500, '', 'MISC TZ Location'],
  ['Pickles', 0, 'gram', 600, 'My Vendor', '2025-08-21', '', 'fruits & vegetables', '300grams', 4000, '', 'MISC TZ Location'],
  ['Pili Pili Mbuzi', 0, 'gram', 60, 'My Vendor', '2025-08-21', '', 'fruits & vegetables', '30grams', 500, '', 'MISC TZ Location'],
  ['Pineapple', 0, 'each', 2, 'My Vendor', '2025-08-21', '', 'fruits & vegetables', '1', 6000, '', 'MISC TZ Location'],
  ['Potatoes', 0, 'gram', 2, 'My Vendor', '2025-08-21', '', 'fruits & vegetables', '1kg', 2000, '', 'MISC TZ Location'],
  ['Tomato (Veggie)', -102.293, 'grams', 2, 'My Vendor', '2025-08-21', '', 'fruits & vegetables', '1kg', 2000, '', 'MISC TZ Location'],
  ['Black Pepper', -1.11, 'grams', 200, 'My Vendor', '2025-08-21', '', 'dried ingredients', '100grams', 7000, '', 'MISC TZ Location'],
  ['Bread Crumbs', 0, 'gram', 1, 'Wrap & Roll', '2025-08-21', '', 'dried ingredients', '1kg', 3500, '', 'MISC TZ Location'],
  ['Coffee Ground', 0, 'grams', 800, 'My Vendor', '2025-08-21', '', 'dried ingredients', '400grams', 16000, '', 'MISC TZ Location'],
  ['Coriander', 0, 'gram', 10, 'My Vendor', '2025-08-21', '', 'dried ingredients', '5grams', 1000, '', 'MISC TZ Location'],
  ['Flour/ Dough', -10665, 'gram', 1, 'My Vendor', '2025-08-21', '', 'dried ingredients', '5kg', 13500, '', 'MISC TZ Location'],
  ['Ginger & Garlic', 0, 'gram', 700, 'My Vendor', '2025-08-21', '', 'dried ingredients', '350grams', 10000, '', 'MISC TZ Location'],
  ['Kimbo', 0, 'gram', 1000, 'My Vendor', '2025-08-21', '', 'dried ingredients', '500grams', 5000, '', 'MISC TZ Location'],
  ['Oregano', 0, 'gram', 400, 'My Vendor', '2025-08-21', '', 'dried ingredients', '200grams', 9500, '', 'MISC TZ Location'],
  ['Salt', -0.72, 'gram', 1000, 'My Vendor', '2025-08-21', '', 'dried ingredients', '500grams', 500, '', 'MISC TZ Location'],
  ['Sesame Seed', 0, 'gram', 200, 'My Vendor', '2025-08-21', '', 'dried ingredients', '100grams', 5000, '', 'MISC TZ Location'],
  ['Sugar', 0, 'gram', 2, 'My Vendor', '2025-08-21', '', 'dried ingredients', '1kg', 3000, '', 'MISC TZ Location'],
  ['Sugar Satchets', 0, 'unit', 800, 'My Vendor', '2025-08-21', '', 'dried ingredients', '400units', 19450, '', 'MISC TZ Location'],
  ['Table Salt', 0, 'gram', 2, 'My Vendor', '2025-08-21', '', 'dried ingredients', '1kg', 0, '', 'MISC TZ Location'],
  ['Wheat Flour', 0, 'gram', 2, 'My Vendor', '2025-08-21', '', 'dried ingredients', '1kg', 0, '', 'MISC TZ Location'],
  ['Yeast', 0, 'gram', 1000, 'My Vendor', '2025-08-21', '', 'dried ingredients', '500grams', 8500, '', 'MISC TZ Location'],
  ['Water 500ml', 1500, 'ml', 10, 'My Vendor', '2025-08-21', '', 'soft drinks', '500ml', 1500, '', 'Coca Cola/Pepsi Bottler'],
  ['Soda 600ml', 2000, 'ml', 10, 'Pepsi/CocaCola', '2025-08-21', '', 'soft drinks', '12x pack, 600mL', 2000, '', 'Coca Cola/Pepsi Bottler'],
  ['Soda 1.25L', 4000, 'ml', 10, 'Pepsi/CocaCola', '2025-08-21', '', 'soft drinks', '12x pack, 1.2L', 4000, '', 'Coca Cola/Pepsi Bottler'],
  ['Soda 300ml', 1000, 'ml', 10, 'My Vendor', '2025-08-21', '', 'soft drinks', '12xpack, 300mL', 1000, '', 'Coca Cola/Pepsi Bottler'],
  ['Chocolate Milk', 150, 'L', 40, 'Dairy Best', '2026-08-22', '', 'beverages', 'CHM-01', 3200, '', 'Cooler rack'],
  ['Cinnamon Syrup', 18, 'bottle', 8, 'Flavor Works', '2026-08-22', '', 'sauces', 'CIN-07', 4200, '', 'Back shelving'],
  ['Lemon Syrup', 24, 'bottle', 10, 'Flavor Works', '2026-08-22', '', 'sauces', 'LEM-03', 4200, '', 'Back shelving'],
  ['Ice Cream Cones', 120, 'pcs', 40, 'Sweet Treats', '2026-08-22', '', 'desserts', 'CON-12', 1800, '', 'Dry storage'],
  ['Chicken Nuggets', 36, 'kg', 10, 'Frozen Foods Co', '2026-08-23', '', 'freezer', 'NUG-09', 11500, '', 'Freezer 2'],
  ['Frozen Fries', 46, 'kg', 16, 'Frozen Foods Co', '2026-08-23', '', 'freezer', 'FRY-15', 9000, '', 'Freezer 1'],
  ['Green Salad Mix', 8, 'kg', 6, 'Fresh Farms', '2026-08-23', '', 'produce', 'SAL-04', 2500, '', 'Produce chiller'],
  ['Cabbage', 14, 'kg', 8, 'Fresh Farms', '2026-08-23', '', 'produce', 'CAB-11', 1800, '', 'Produce chiller']
];

const staffRows = [
  ['Grace Kimaro', 'Cashier', 'Morning', 'on-clock', '07:00', 'GK', '+255712111222'],
  ['David Ochieng', 'Head Chef', 'Morning', 'on-clock', '06:30', 'DO', '+255712222333'],
  ['Brian Kato', 'Kitchen Staff', 'Afternoon', 'no-show', null, 'BK', '+255712333444'],
  ['Esther Nyambura', 'Server', 'Morning', 'on-clock', '07:15', 'EN', '+255712444555'],
  ['Alice Marwa', 'Cashier', 'Evening', 'off-clock', null, 'AM', '+255712555666'],
  ['Tom Baraka', 'Kitchen Staff', 'Morning', 'on-clock', '06:45', 'TB', '+255712666777'],
  ['Amina Mohamed', 'Supervisor', 'Morning', 'on-clock', '07:05', 'AMM', '+255712777888'],
  ['Joel Nyerere', 'Delivery Rider', 'Evening', 'on-clock', '15:00', 'JN', '+255712888999'],
  ['Moses Mtafu', 'Trainer', 'Morning', 'on-clock', '08:00', 'MM', '+255712999101']
];

const trainingRows = [
  ['Grace Kimaro', 'POS operations', 'Amina Mohamed', '2026-08-12', 'completed', 96, 'Handled mobile-money checkout flow and refunds.'],
  ['David Ochieng', 'Food safety & kitchen prep', 'Moses Mtafu', '2026-08-18', 'completed', 91, 'Covered temperature control and cross-contamination prevention.'],
  ['Brian Kato', 'Inventory receiving', 'Amina Mohamed', '2026-08-20', 'completed', 88, 'Reviewed stock count, threshold alerts, and receiving records.'],
  ['Esther Nyambura', 'Customer service & upselling', 'Amina Mohamed', '2026-08-14', 'completed', 93, 'Practiced complaint handling and combo recommendations.'],
  ['Tom Baraka', 'Kitchen display workflow', 'David Ochieng', '2026-08-16', 'completed', 90, 'Covered KDS order timing and priority management.'],
  ['Joel Nyerere', 'Delivery protocol', 'Amina Mohamed', '2026-08-21', 'completed', 85, 'Reviewed route efficiency, packaging, and customer call etiquette.'],
  ['Alice Marwa', 'Cash handling & reconciliation', 'Amina Mohamed', '2026-08-24', 'completed', 89, 'Closed register balancing and drawer reconciliation.']
];

const salesRows = [
  ['TR-2001', 'WR-2001', 'Amina Hassan', 45000, 'mobile_money', 'pos', 'completed', '2026-08-01T08:10:00Z'],
  ['TR-2002', 'WR-2002', 'John Kimani', 31200, 'cash', 'pos', 'completed', '2026-08-01T12:40:00Z'],
  ['TR-2003', 'WR-2003', 'Faith Wanjiku', 25600, 'card', 'pos', 'completed', '2026-08-02T11:55:00Z'],
  ['TR-2004', 'WR-2004', 'Peter Omondi', 64000, 'mobile_money', 'delivery', 'completed', '2026-08-03T18:25:00Z'],
  ['TR-2005', 'WR-2005', 'Zainab Mohammed', 38250, 'card', 'pos', 'completed', '2026-08-04T19:05:00Z'],
  ['TR-2006', 'WR-2006', 'Samuel Eriku', 28700, 'cash', 'takeaway', 'completed', '2026-08-05T13:20:00Z'],
  ['TR-2007', 'WR-2007', 'Anna Msuya', 51500, 'mobile_money', 'pos', 'completed', '2026-08-06T16:45:00Z'],
  ['TR-2008', 'WR-2008', 'Ibrahim Kivuyo', 36200, 'card', 'delivery', 'completed', '2026-08-07T20:10:00Z'],
  ['TR-2009', 'WR-2009', 'Lucy Mrema', 24700, 'cash', 'pos', 'completed', '2026-08-08T09:45:00Z'],
  ['TR-2010', 'WR-2010', 'George Mlay', 58000, 'mobile_money', 'delivery', 'completed', '2026-08-09T21:15:00Z'],
  ['TR-2011', 'WR-2011', 'Mariam Shauri', 40800, 'card', 'pos', 'completed', '2026-08-10T18:00:00Z'],
  ['TR-2012', 'WR-2012', 'Peter Chacha', 33200, 'cash', 'takeaway', 'completed', '2026-08-11T12:05:00Z'],
  ['TR-2013', 'WR-2013', 'Nora Kisaka', 47250, 'mobile_money', 'pos', 'completed', '2026-08-12T17:30:00Z'],
  ['TR-2014', 'WR-2014', 'Paul Kilele', 29500, 'card', 'delivery', 'completed', '2026-08-13T19:50:00Z']
];

function ensureTable() {
  db.exec(`
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
  `);
}

function seedInventory() {
  const stmt = db.prepare(`
    INSERT INTO inventory (name, quantity, unit, threshold, supplier, last_restocked, image_url, category, sku, unit_cost, expiry_date, storage_location)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  for (const row of inventoryRows) {
    const exists = db.prepare('SELECT id FROM inventory WHERE name = ?').get(row[0]);
    if (!exists) {
      stmt.run(...row);
      inserted += 1;
    }
  }
  return inserted;
}

function seedStaff() {
  const stmt = db.prepare(`
    INSERT INTO staff (name, role, shift, status, clock_in, avatar, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  for (const row of staffRows) {
    const exists = db.prepare('SELECT id FROM staff WHERE name = ? AND role = ?').get(row[0], row[1]);
    if (!exists) {
      stmt.run(...row);
      inserted += 1;
    }
  }
  return inserted;
}

function seedTraining() {
  const stmt = db.prepare(`
    INSERT INTO training_records (staff_name, topic, trainer, training_date, status, score, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  for (const row of trainingRows) {
    const exists = db.prepare('SELECT id FROM training_records WHERE staff_name = ? AND topic = ? AND training_date = ?').get(row[0], row[1], row[3]);
    if (!exists) {
      stmt.run(...row);
      inserted += 1;
    }
  }
  return inserted;
}

function seedSales() {
  const stmt = db.prepare(`
    INSERT INTO sales_transactions (id, order_id, customer_name, amount, payment_method, channel, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  for (const row of salesRows) {
    const exists = db.prepare('SELECT id FROM sales_transactions WHERE id = ?').get(row[0]);
    if (!exists) {
      stmt.run(...row);
      inserted += 1;
    }
  }
  return inserted;
}

function seedMonthlySales() {
  const salesCount = db.prepare('SELECT COUNT(*) AS c FROM sales_monthly').get().c;
  if (salesCount === 0) {
    const months = [
      ['Jan', 89200, 2340, 21400],
      ['Feb', 94500, 2510, 23200],
      ['Mar', 102300, 2680, 25800],
      ['Apr', 98700, 2590, 24100],
      ['May', 115600, 2890, 29500],
      ['Jun', 108400, 2750, 27200],
      ['Jul', 121800, 3120, 31400],
      ['Aug', 134200, 3380, 34800]
    ];
    const stmt = db.prepare('INSERT INTO sales_monthly (month, revenue, orders_count, profit) VALUES (?, ?, ?, ?)');
    for (const row of months) stmt.run(...row);
    return months.length;
  }
  return 0;
}

try {
  ensureTable();
  const inv = seedInventory();
  const staffCount = seedStaff();
  const trainingCount = seedTraining();
  const salesCount = seedSales();
  const monthlySalesCount = seedMonthlySales();

  const summary = {
    inventoryInserted: inv,
    staffInserted: staffCount,
    trainingInserted: trainingCount,
    transactionsInserted: salesCount,
    monthlySalesInserted: monthlySalesCount,
    totalInventory: db.prepare('SELECT COUNT(*) AS c FROM inventory').get().c,
    totalStaff: db.prepare('SELECT COUNT(*) AS c FROM staff').get().c,
    totalTraining: db.prepare('SELECT COUNT(*) AS c FROM training_records').get().c,
    totalTransactions: db.prepare('SELECT COUNT(*) AS c FROM sales_transactions').get().c,
    totalMonthlySales: db.prepare('SELECT COUNT(*) AS c FROM sales_monthly').get().c,
  };

  console.log(JSON.stringify(summary));
} catch (error) {
  console.error('SEED_BUSINESS_ERROR');
  console.error(error);
  process.exitCode = 1;
} finally {
  db.close();
}
