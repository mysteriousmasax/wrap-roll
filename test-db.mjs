import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'server/db/wraproll.db');

const db = new Database(DB_PATH);

const count = db.prepare('SELECT COUNT(*) as c FROM menu_items').get();
console.log('Menu items count:', count.c);

const items = db.prepare('SELECT id, name, price, category FROM menu_items ORDER BY id LIMIT 5').all();
console.log('First 5 items:');
items.forEach(item => {
  console.log(`  - ${item.id}: ${item.name} (${item.category}) - ${item.price}`);
});

const categories = db.prepare('SELECT DISTINCT category FROM menu_items').all();
console.log('\nCategories:', categories.map(c => c.category).join(', '));

db.close();
