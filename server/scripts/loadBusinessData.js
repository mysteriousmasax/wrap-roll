const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = path.join(__dirname, '..', 'db', 'wraproll.db');
const db = new DatabaseSync(dbPath);

const menuItems = [
  ['Veggie Wrap', 'Fresh vegetables wrapped', 12500, 'wraps', 1],
  ['Grilled Chicken Tandoori Wrap', 'Tandoori spiced chicken wrap', 19000, 'wraps', 1],
  ['Grilled Chicken Lemon Wrap', 'Lemon chicken wrap', 19000, 'wraps', 1],
  ['House Steak Wrap', 'Premium steak wrap', 20000, 'wraps', 1],
  ['Smoked Beef Wrap', 'Smoked beef wrap', 20000, 'wraps', 1],
  ['Pastrami Beef Wrap', 'Pastrami beef wrap', 20000, 'wraps', 1],
  ['Classic Tuna Wrap', 'Classic tuna wrap', 20000, 'wraps', 1],
  ['Sweet/BBQ Chicken Wrap', 'BBQ chicken wrap', 19000, 'wraps', 1],
  ['Veggie Salad', 'Fresh veggie salad', 12500, 'salads', 1],
  ['Grilled Chicken Tandoori Salad', 'Tandoori chicken salad', 19000, 'salads', 1],
  ['Grilled Chicken Lemon Salad', 'Lemon chicken salad', 19000, 'salads', 1],
  ['House Steak Salad', 'Steak salad', 20000, 'salads', 1],
  ['Smoked Beef Salad', 'Smoked beef salad', 20000, 'salads', 1],
  ['Pastrami Beef Salad', 'Pastrami beef salad', 20000, 'salads', 1],
  ['Classic Tuna Salad', 'Tuna salad', 19000, 'salads', 1],
  ['Sweet/BBQ Chicken Salad', 'BBQ chicken salad', 19000, 'salads', 1],
  ['House Salad - All Toppings', 'All veggies plus any choice of meat, jalapenos and olives. Avocado seasonal.', 24000, 'salads', 1],
  ['Veggie Roll (Half)', 'Half veggie roll', 7000, 'rolls', 1],
  ['Veggie Roll (Full)', 'Full veggie roll', 13000, 'rolls', 1],
  ['Grilled Chicken Tandoori Roll (Half)', 'Half tandoori chicken roll', 13000, 'rolls', 1],
  ['Grilled Chicken Tandoori Roll (Full)', 'Full tandoori chicken roll', 24000, 'rolls', 1],
  ['Grilled Lemon Chicken Roll (Half)', 'Half lemon chicken roll', 13000, 'rolls', 1],
  ['Grilled Lemon Chicken Roll (Full)', 'Full lemon chicken roll', 24000, 'rolls', 1],
  ['Sweet/BBQ Chicken Roll (Half)', 'Half BBQ chicken roll', 13000, 'rolls', 1],
  ['Sweet/BBQ Chicken Roll (Full)', 'Full BBQ chicken roll', 25000, 'rolls', 1],
  ['House Steak Roll (Half)', 'Half steak roll', 14000, 'rolls', 1],
  ['House Steak Roll (Full)', 'Full steak roll', 25000, 'rolls', 1],
  ['Smoked Beef Roll (Half)', 'Half smoked beef roll', 14000, 'rolls', 1],
  ['Smoked Beef Roll (Full)', 'Full smoked beef roll', 25000, 'rolls', 1],
  ['Pastrami Beef Roll (Half)', 'Half pastrami roll', 14000, 'rolls', 1],
  ['Pastrami Beef Roll (Full)', 'Full pastrami roll', 25000, 'rolls', 1],
  ['Classic Tuna Roll (Half)', 'Half tuna roll', 14000, 'rolls', 1],
  ['Classic Tuna Roll (Full)', 'Full tuna roll', 25000, 'rolls', 1],
  ['Chicken Pizza (Small)', 'Small chicken pizza', 12500, 'pizzas', 1],
  ['Chicken Pizza (Medium)', 'Medium chicken pizza', 19000, 'pizzas', 1],
  ['Chicken Pizza (Large)', 'Large chicken pizza', 23000, 'pizzas', 1],
  ['Chicken and Mushroom Pizza (Small)', 'Small chicken and mushroom pizza', 12500, 'pizzas', 1],
  ['Chicken and Mushroom Pizza (Medium)', 'Medium chicken and mushroom pizza', 19000, 'pizzas', 1],
  ['Chicken and Mushroom Pizza (Large)', 'Large chicken and mushroom pizza', 23000, 'pizzas', 1],
  ['Hawaiian Chicken Pizza (Small)', 'Small Hawaiian chicken pizza', 12500, 'pizzas', 1],
  ['Hawaiian Chicken Pizza (Medium)', 'Medium Hawaiian chicken pizza', 19000, 'pizzas', 1],
  ['Hawaiian Chicken Pizza (Large)', 'Large Hawaiian chicken pizza', 23000, 'pizzas', 1],
  ['Steak Pizza (Small)', 'Small steak pizza', 12500, 'pizzas', 1],
  ['Steak Pizza (Medium)', 'Medium steak pizza', 19000, 'pizzas', 1],
  ['Steak Pizza (Large)', 'Large steak pizza', 23000, 'pizzas', 1],
  ['Russian Beef Sausage Pizza (Small)', 'Small beef sausage pizza', 12500, 'pizzas', 1],
  ['Russian Beef Sausage Pizza (Medium)', 'Medium beef sausage pizza', 19000, 'pizzas', 1],
  ['Russian Beef Sausage Pizza (Large)', 'Large beef sausage pizza', 23000, 'pizzas', 1],
  ['Meaty Lovers (Small)', 'Small meaty lovers pizza', 19000, 'pizzas', 1],
  ['Meaty Lovers (Medium)', 'Medium meaty lovers pizza', 25000, 'pizzas', 1],
  ['Meaty Lovers (Large)', 'Large meaty lovers pizza', 30000, 'pizzas', 1],
  ['Veggie Delight (Small)', 'Small veggie delight pizza', 10000, 'pizzas', 1],
  ['Veggie Delight (Medium)', 'Medium veggie delight pizza', 14000, 'pizzas', 1],
  ['Veggie Delight (Large)', 'Large veggie delight pizza', 18000, 'pizzas', 1],
  ['Beef Burger', 'Classic beef burger', 12500, 'burgers', 1],
  ['Chicken Burger', 'Chicken burger', 9000, 'burgers', 1],
  ['2x Beef Burger', 'Double beef burger', 18000, 'burgers', 1],
  ['Beef/Chicken Burger Meal', 'Burger + 600ml soda', 13000, 'combos', 1],
  ['Beef/Chicken Burger Combo', 'Burger + small fries + 600ml soda', 17000, 'combos', 1],
  ['Chicken Roll Lunchbox', 'Half roll + small fries + 600ml soda', 17000, 'combos', 1],
  ['Chicken Wrap Combo', 'Sweet/BBQ wrap + small fries + 300ml soda', 22000, 'combos', 1],
  ['Burger and Pizza Combo', '1 burger + 1 medium pizza + 2 small fries + 2 soda 300ml', 34000, 'combos', 1],
  ['FootLong Roll Combo', '1 full BBQ chicken roll + 1 medium fries + 2 small sodas 300ml', 31000, 'combos', 1],
  ['2x Pizza Combo', '2 medium pizzas + 1 medium fries + 2 sodas 600ml', 42000, 'combos', 1],
  ['Pizza + 2x Burger Combo', '1 medium pizza + 2 burgers + 2 small fries + 3 sodas 300ml', 48000, 'combos', 1],
  ['Family Combo Package', '2 large pizzas + 2 burgers + 2 medium fries + 1 soda 1.25L', 74000, 'combos', 1],
  ['Americano Black', 'Hot black americano', 5500, 'drinks', 1],
  ['Americano White', 'Americano white', 6500, 'drinks', 1],
  ['Cappuccino', 'Classic cappuccino', 6500, 'drinks', 1],
  ['Latte', 'Creamy latte', 7500, 'drinks', 1],
  ['Espresso', 'Strong espresso', 4000, 'drinks', 1],
  ['Black Tea', 'Hot black tea', 3500, 'drinks', 1],
  ['Milk Tea', 'Tea with milk', 5500, 'drinks', 1],
  ['Hot Chocolate', 'Hot chocolate drink', 6000, 'drinks', 1],
  ['Iced Lattes', 'Cold iced latte', 8000, 'drinks', 1],
  ['Iced Americano', 'Cold americano', 5500, 'drinks', 1],
  ['Iced Cappuccino', 'Cold cappuccino', 6500, 'drinks', 1],
  ['Iced Lemon Tea', 'Cold lemon tea', 6000, 'drinks', 1],
  ['Iced Tea Mint', 'Mint iced tea', 5000, 'drinks', 1],
  ['Fresh Juice (Seasonal)', 'Fresh seasonal juice', 9000, 'drinks', 1],
  ['Water 500ml', 'Bottled water', 1500, 'drinks', 1],
  ['Soda 600ml', 'Soft drink 600ml', 3000, 'drinks', 1],
  ['Soda 1.25L', 'Soft drink 1.25L', 5000, 'drinks', 1],
  ['Soda 300ml', 'Soft drink 300ml', 1500, 'drinks', 1],
];

const inventory = [
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
];

function clearExistingSeedData() {
  db.exec(`DELETE FROM inventory; DELETE FROM menu_items; DELETE FROM settings;`);
}

function seedSettings() {
  const entries = [
    ['restaurant_name', 'Wrap & Roll'],
    ['branch_location', 'Mikocheni, Dar es Salaam'],
    ['currency', 'TZS'],
    ['tax_rate', '18'],
    ['phone', '+255746222889'],
    ['email', 'info@wrapandrolltz.com'],
    ['payment_mobile', 'true'],
    ['payment_cash', 'true'],
    ['payment_card', 'true'],
    ['reservation_enabled', 'true'],
  ];

  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of entries) stmt.run(key, String(value));
}

function seedMenu() {
  const stmt = db.prepare('INSERT INTO menu_items (name, description, price, category, image, popular, active) VALUES (?, ?, ?, ?, ?, ?, 1)');
  for (const item of menuItems) {
    stmt.run(item[0], item[1], item[2], item[3], '', item[4]);
  }
}

function seedInventory() {
  const stmt = db.prepare('INSERT INTO inventory (name, quantity, unit, threshold, supplier, last_restocked, image_url, category, sku, unit_cost, expiry_date, storage_location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const item of inventory) {
    stmt.run(item[0], Number(item[1]), item[2], Number(item[3]), item[4], item[5], item[6], item[7], item[8], Number(item[9]), item[10], item[11]);
  }
}

try {
  clearExistingSeedData();
  seedSettings();
  seedMenu();
  seedInventory();

  const menuCount = db.prepare('SELECT COUNT(*) AS c FROM menu_items').get().c;
  const inventoryCount = db.prepare('SELECT COUNT(*) AS c FROM inventory').get().c;
  const settingsCount = db.prepare('SELECT COUNT(*) AS c FROM settings').get().c;

  console.log('SEED OK');
  console.log({ menuCount, inventoryCount, settingsCount });
} catch (error) {
  console.error('SEED ERROR');
  console.error(error);
  process.exitCode = 1;
} finally {
  db.close();
}
