import { DatabaseSync } from 'node:sqlite';
import { seedFromDocuments } from '../db/documentSeed.js';

const db = new DatabaseSync(new URL('../db/wraproll.db', import.meta.url).pathname);

const tableNames = [
  'order_items', 'payments', 'refunds', 'sales_transactions', 'orders', 'sales_monthly',
  'shift_logs', 'payroll_records', 'training_records', 'customers', 'staff', 'inventory',
  'menu_items', 'settings'
];

for (const table of tableNames) {
  try {
    db.prepare(`DELETE FROM ${table}`).run();
  } catch {
    // table may not yet exist, which is fine for a refresh script that also checks the schema
  }
}

const result = seedFromDocuments(db);
console.log(JSON.stringify({ refreshed: true, ...result }, null, 2));
db.close();