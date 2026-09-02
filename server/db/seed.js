import { hashPin } from '../utils/pins.js';

export async function seedDatabase(db, options = {}) {
  const includeLegacyFixtures = options.includeLegacyFixtures !== false;
  const insertUser = db.prepare('INSERT INTO users (name, role, pin, avatar) VALUES (?, ?, ?, ?)');
  for (const u of [
    ['Adila Ismail', 'admin', '1234', 'AI'],
    ['Grace Kimaro', 'foh', '2345', 'GK'],
    ['David Ochieng', 'kitchen', '3456', 'DO'],
    ['Emmanuel Makaya', 'manager', '4567', 'EM'],
    ['Michael Otieno', 'executive', '5678', 'MO'],
  ]) {
    insertUser.run(u[0], u[1], await hashPin(u[2]), u[3]);
  }

  if (!includeLegacyFixtures) {
    const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    [
      ['restaurant_name', 'Wrap & Roll'],
      ['branch_location', 'Wikicha Tower, Mwai Kibaki Road, Dar es Salaam'],
      ['phone', '+255 746 222 889'],
      ['email', 'info@wrapandrolltz.com'],
      ['operating_hours', 'Daily, 7:00 AM - 11:00 PM'],
      ['timezone', 'Africa/Dar_es_Salaam'],
      ['currency', 'TZS'],
      ['tax_rate', '18'],
      ['payment_card', 'true'],
      ['payment_mobile', 'true'],
      ['payment_cash', 'true'],
      ['public_animation_enabled', 'true'],
      ['public_animation_style', 'lift'],
      ['public_animation_duration', '650'],
      ['public_animation_replay', 'true'],
    ].forEach((s) => insertSetting.run(...s));

    db.prepare('INSERT OR IGNORE INTO order_counter (id, next_id) VALUES (1, 1001)').run();
    return { seededUsers: 5, legacyFixtures: 0 };
  }

  const insertMenu = db.prepare(
    'INSERT INTO menu_items (name, description, price, category, image, popular) VALUES (?, ?, ?, ?, ?, ?)'
  );
  [
    ['Signature Chicken Wrap', 'Crispy chicken, fresh veggies, signature sauce', 12.49, 'wraps', 'https://images.unsplash.com/photo-1626700051175-68adf18b0e03?w=300&h=300&fit=crop', 1],
    ['Spicy Beef Wrap', 'Seasoned beef, jalapenos, chipotle mayo', 13.99, 'wraps', 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=300&h=300&fit=crop', 0],
    ['Veggie Supreme Wrap', 'Grilled halloumi, roasted vegetables, hummus', 10.99, 'wraps', 'https://images.unsplash.com/photo-1540914124281-342587941389?w=300&h=300&fit=crop', 0],
    ['BBQ Chicken Wrap', 'Smoky BBQ sauce, grilled chicken, coleslaw', 11.99, 'wraps', 'https://images.unsplash.com/photo-1600335895229-3bf8a2b66c0e?w=300&h=300&fit=crop', 1],
    ['Classic Chicken Roll', 'Tender chicken strips, lettuce, tomato, ranch', 9.99, 'rolls', 'https://images.unsplash.com/photo-1551782450-17144efb9c50?w=300&h=300&fit=crop', 1],
    ['Teriyaki Salmon Roll', 'Glazed salmon, avocado, pickled ginger', 15.99, 'rolls', 'https://images.unsplash.com/photo-1553621042-f6e147245754?w=300&h=300&fit=crop', 0],
    ['Falafel Roll', 'Crispy falafel, tahini, fresh herbs', 8.99, 'rolls', 'https://images.unsplash.com/photo-1529059965260-4f35ca55cb38?w=300&h=300&fit=crop', 0],
    ['Spicy Tuna Roll', 'Fresh tuna, spicy mayo, cucumber, sesame', 14.49, 'rolls', 'https://images.unsplash.com/photo-1617196034796-73dfa7bfe278?w=300&h=300&fit=crop', 1],
    ['Seasoned Fries', 'Crispy golden fries with house seasoning', 4.99, 'sides', 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=300&h=300&fit=crop', 1],
    ['Onion Rings', 'Beer-battered onion rings with dipping sauce', 5.49, 'sides', 'https://images.unsplash.com/photo-1639024471283-03518883512d?w=300&h=300&fit=crop', 0],
    ['Coleslaw', 'Creamy homemade coleslaw', 3.49, 'sides', 'https://images.unsplash.com/photo-1625938145312-a5738b8762f4?w=300&h=300&fit=crop', 0],
    ['Sweet Potato Fries', 'Crispy sweet potato fries with aioli', 5.99, 'sides', 'https://images.unsplash.com/photo-1598662922294-9e1a3d085a5c?w=300&h=300&fit=crop', 0],
    ['Fountain Drink', 'Coke, Sprite, Fanta, or Diet Coke', 2.99, 'drinks', 'https://images.unsplash.com/photo-1581636625402-29b2a704ef13?w=300&h=300&fit=crop', 0],
    ['Fresh Juice', 'Mango, Passion, Orange, or Pineapple', 4.49, 'drinks', 'https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=300&h=300&fit=crop', 1],
    ['Iced Tea', 'Classic or Peach flavored', 3.49, 'drinks', 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=300&h=300&fit=crop', 0],
    ['Milkshake', 'Vanilla, Chocolate, or Strawberry', 6.49, 'drinks', 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=300&h=300&fit=crop', 0],
  ].forEach((m) => insertMenu.run(...m));

  const brandMenuImages = [
    'https://wrapandrolltz.com/uploads/photo_gallery/d706fc0ef56440dd131465fd75aae870.jpg',
    'https://wrapandrolltz.com/uploads/photo_gallery/c24c7b3e15ad597021def8b940058a69.jpg',
    'https://wrapandrolltz.com/uploads/photo_gallery/01deca3b2de50c4ffbc3e6a67bc89c25.jpg',
    'https://wrapandrolltz.com/uploads/photo_gallery/7f216e751ec3d742964c664e58fd487d.jpg',
  ];
  db.prepare('SELECT id FROM menu_items ORDER BY id').all().forEach((item, index) => {
    db.prepare('UPDATE menu_items SET image = ? WHERE id = ?').run(brandMenuImages[index % brandMenuImages.length], item.id);
  });
  db.prepare('UPDATE menu_items SET price = price * 2500').run();

  const insertMod = db.prepare('INSERT INTO modifiers (name, price, type) VALUES (?, ?, ?)');
  [
    ['Extra Cheese', 1.0, 'add'], ['Avocado', 1.5, 'add'], ['Spicy Mayo', 0.5, 'add'],
    ['Extra Sauce', 0.5, 'add'], ['Jalapenos', 0.75, 'add'], ['Bacon', 2.0, 'add'],
    ['No Onions', 0, 'remove'], ['No Tomato', 0, 'remove'], ['No Sauce', 0, 'remove'], ['No Cheese', 0, 'remove'],
  ].forEach((m) => insertMod.run(...m));
  db.prepare('UPDATE modifiers SET price = price * 2500').run();

  const insertTable = db.prepare(
    'INSERT INTO tables (number, seats, status, x, y, current_order_id, reservation, tag_id, image_url, zone, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const tableImages = [
    'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop',
  ];
  const tableZones = ['Garden Terrace', 'Main Dining', 'Window Bay', 'Chef Line View', 'VIP Corner', 'Main Dining', 'Window Bay', 'Patio Deck', 'Main Dining', 'Family Corner', 'Garden Terrace', 'Patio Deck'];
  [
    [1, 2, 'available', 10, 10, null, null, 'WR-T01', tableImages[0], tableZones[0], 'NFC tag active - ready for walk-in guest'],
    [2, 4, 'occupied', 30, 10, 'WR-1001', null, 'WR-T02', tableImages[1], tableZones[1], 'Live order in progress - kitchen tracking active'],
    [3, 4, 'available', 50, 10, null, null, 'WR-T03', tableImages[2], tableZones[2], 'Quick-turn table for casual dining'],
    [4, 6, 'reserved', 70, 10, null, '6:30 PM', 'WR-T04', tableImages[3], tableZones[3], 'Reservation confirmed for a family gathering'],
    [5, 2, 'occupied', 10, 35, 'WR-1003', null, 'WR-T05', tableImages[4], tableZones[4], 'Guest check-in confirmed by NFC tap'],
    [6, 4, 'available', 30, 35, null, null, 'WR-T06', tableImages[5], tableZones[5], 'Open for quick seating'],
    [7, 8, 'reserved', 50, 35, null, '7:00 PM', 'WR-T07', tableImages[6], tableZones[6], 'Large party booking with high chair request'],
    [8, 2, 'cleaning', 70, 35, null, null, 'WR-T08', tableImages[7], tableZones[7], 'Cleaning in progress - sanitizing surfaces'],
    [9, 4, 'available', 10, 60, null, null, 'WR-T09', tableImages[8], tableZones[8], 'Ready for afternoon walk-ins'],
    [10, 6, 'occupied', 30, 60, 'WR-1004', null, 'WR-T10', tableImages[9], tableZones[9], 'Guest arrival confirmed through NFC check-in'],
    [11, 4, 'available', 50, 60, null, null, 'WR-T11', tableImages[10], tableZones[10], 'Table prepared for next turn'],
    [12, 2, 'available', 70, 60, null, null, 'WR-T12', tableImages[11], tableZones[11], 'Compact table for two with quick service setup'],
  ].forEach((t) => insertTable.run(...t));

  const insertCustomer = db.prepare(
    'INSERT INTO customers (name, tier, lifetime_value, favorite_items, last_visit, phone, visits, at_risk) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  [
    ['Amina Hassan', 'VIP', 12450, '["Signature Chicken Wrap","Fresh Juice"]', '2026-08-14', '+255 712 345 678', 89, 0],
    ['John Kimani', 'VIP', 9820, '["Spicy Beef Wrap","Iced Tea"]', '2026-08-15', '+255 713 456 789', 67, 0],
    ['Faith Wanjiku', 'Regular', 4560, '["Veggie Supreme Wrap"]', '2026-07-10', '+255 714 567 890', 34, 1],
    ['Peter Omondi', 'Regular', 3890, '["Classic Chicken Roll","Seasoned Fries"]', '2026-06-28', '+255 715 678 901', 28, 1],
    ['Zainab Mohammed', 'Gold', 7650, '["Teriyaki Salmon Roll","Mango Juice"]', '2026-08-13', '+255 716 789 012', 52, 0],
    ['Samuel Eriku', 'Regular', 2340, '["BBQ Chicken Wrap"]', '2026-08-11', '+255 717 890 123', 18, 0],
  ].forEach((c) => insertCustomer.run(...c));

  const insertStaff = db.prepare(
    'INSERT INTO staff (name, role, shift, status, clock_in, avatar, phone) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  [
    ['Grace Kimaro', 'Cashier', 'Morning', 'on-clock', '7:00 AM', 'GK', '+255 712 111 222'],
    ['David Ochieng', 'Head Chef', 'Morning', 'on-clock', '6:30 AM', 'DO', '+255 712 222 333'],
    ['Brian Kato', 'Kitchen Staff', 'Afternoon', 'no-show', null, 'BK', '+255 712 333 444'],
    ['Esther Nyambura', 'Server', 'Morning', 'on-clock', '7:15 AM', 'EN', '+255 712 444 555'],
    ['Alice Marwa', 'Cashier', 'Evening', 'off-clock', null, 'AM', '+255 712 555 666'],
    ['Tom Baraka', 'Kitchen Staff', 'Morning', 'on-clock', '6:45 AM', 'TB', '+255 712 666 777'],
  ].forEach((s) => insertStaff.run(...s));

  const insertInv = db.prepare(
    'INSERT INTO inventory (name, quantity, unit, threshold, supplier, last_restocked, image_url, category, sku, unit_cost, expiry_date, storage_location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const inventoryImages = {
    'Chicken Breast': 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=240&h=180&fit=crop',
    'Beef Strips': 'https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=240&h=180&fit=crop',
    'Tortilla Wraps': 'https://images.unsplash.com/photo-1626700051175-68adf18b0e03?w=240&h=180&fit=crop',
    'Lettuce': 'https://images.unsplash.com/photo-1622205313162-be1d5712a43c?w=240&h=180&fit=crop',
    'Tomatoes': 'https://images.unsplash.com/photo-1546094096-0df4bcaaa337?w=240&h=180&fit=crop',
    'Cheese Slices': 'https://images.unsplash.com/photo-1618164436241-4473940d1f5c?w=240&h=180&fit=crop',
    'Cooking Oil': 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=240&h=180&fit=crop',
    'Salmon Fillet': 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=240&h=180&fit=crop',
    'Potatoes': 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=240&h=180&fit=crop',
    'Soft Drinks': 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=240&h=180&fit=crop',
  };
  const inventoryDetails = {
    'Chicken Breast': ['protein', 'INV-CH-001', 14500, '2026-08-27', 'Cold room A'],
    'Beef Strips': ['protein', 'INV-BF-002', 18500, '2026-08-26', 'Cold room A'],
    'Tortilla Wraps': ['bakery', 'INV-TW-003', 850, '2026-09-05', 'Dry store shelf 1'],
    Lettuce: ['produce', 'INV-LT-004', 2200, '2026-08-25', 'Produce chiller'],
    Tomatoes: ['produce', 'INV-TM-005', 1800, '2026-08-25', 'Produce chiller'],
    'Cheese Slices': ['dairy', 'INV-CS-006', 9800, '2026-08-24', 'Cold room B'],
    'Cooking Oil': ['dry goods', 'INV-CO-007', 7200, '2027-02-01', 'Dry store shelf 3'],
    'Salmon Fillet': ['seafood', 'INV-SM-008', 26000, '2026-08-24', 'Cold room B'],
    Potatoes: ['produce', 'INV-PT-009', 1200, '2026-09-01', 'Dry store shelf 2'],
    'Soft Drinks': ['beverages', 'INV-SD-010', 1100, '2027-01-10', 'Beverage rack'],
  };
  [
    ['Chicken Breast', 45, 'kg', 20, 'Fresh Farms Ltd', '2026-08-14'],
    ['Beef Strips', 18, 'kg', 15, 'Meat Masters', '2026-08-13'],
    ['Tortilla Wraps', 200, 'pcs', 100, 'Bakery Plus', '2026-08-15'],
    ['Lettuce', 12, 'kg', 10, 'Green Valley', '2026-08-14'],
    ['Tomatoes', 25, 'kg', 15, 'Green Valley', '2026-08-15'],
    ['Cheese Slices', 8, 'kg', 10, 'Dairy Best', '2026-08-12'],
    ['Cooking Oil', 30, 'liters', 15, 'Oil Express', '2026-08-10'],
    ['Salmon Fillet', 5, 'kg', 8, 'Ocean Catch', '2026-08-13'],
    ['Potatoes', 50, 'kg', 25, 'Fresh Farms Ltd', '2026-08-14'],
    ['Soft Drinks', 120, 'cans', 50, 'BevCo', '2026-08-15'],
  ].forEach((i) => {
    const details = inventoryDetails[i[0]];
    insertInv.run(...i, inventoryImages[i[0]], ...details);
  });

  const insertSales = db.prepare(
    'INSERT INTO sales_monthly (month, revenue, orders_count, profit) VALUES (?, ?, ?, ?)'
  );
  [
    ['Jan', 89200, 2340, 21400], ['Feb', 94500, 2510, 23200], ['Mar', 102300, 2680, 25800],
    ['Apr', 98700, 2590, 24100], ['May', 115600, 2890, 29500], ['Jun', 108400, 2750, 27200],
    ['Jul', 121800, 3120, 31400], ['Aug', 134200, 3380, 34800],
  ].forEach((s) => insertSales.run(...s));

  const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  [
    ['restaurant_name', 'Wrap & Roll'],
    ['branch_location', 'Mwai Kibaki Rd, Mikocheni (Wikicha Tower), Dar es Salaam'],
    ['phone', '+255 746 222 889'],
    ['email', 'info@wrapandrolltz.com'],
    ['operating_hours', '7:00 AM - 11:00 PM'],
    ['timezone', 'Africa/Dar_es_Salaam'],
    ['tax_rate', '8'],
    ['vat_rate', '18'],
    ['currency', 'TZS'],
    ['tax_id', 'TIN-123-456-789'],
    ['payment_card', 'true'],
    ['payment_mobile', 'true'],
    ['payment_cash', 'true'],
    ['lipa_namba_number', '123456'],
    ['public_animation_enabled', 'true'],
    ['public_animation_style', 'lift'],
    ['public_animation_duration', '650'],
    ['public_animation_replay', 'true'],
  ].forEach((s) => insertSetting.run(...s));

  const insertNotif = db.prepare(
    'INSERT INTO notifications (type, title, message, read, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const now = new Date();
  [
    ['warning', 'Low Stock Alert', 'Chicken breast inventory below threshold (15 units)', 0, new Date(now - 5 * 60000).toISOString()],
    ['info', 'New Reservation', 'Table 7 reserved for 6:30 PM - Party of 4', 0, new Date(now - 12 * 60000).toISOString()],
    ['success', 'Payment Received', 'Order WR-1008 - TZS 45,000 via Mobile Money', 1, new Date(now - 18 * 60000).toISOString()],
    ['error', 'Staff No-Show', 'Kitchen staff Brian K. did not clock in for 2:00 PM shift', 1, new Date(now - 32 * 60000).toISOString()],
    ['info', 'Daily Report Ready', 'End-of-day sales report has been generated', 1, new Date(now - 60 * 60000).toISOString()],
  ].forEach((n) => insertNotif.run(...n));

  db.prepare('INSERT INTO order_counter (id, next_id) VALUES (1, 1001)').run();

  seedKitchenOrders(db);
}

function seedKitchenOrders(db) {
  const orders = [
    {
      id: 'WR-1001', type: 'dine-in', table: 2, status: 'preparing',
      createdAt: new Date(Date.now() - 8 * 60000).toISOString(),
      items: [
        { name: 'Signature Chicken Wrap', qty: 2, price: 12.49, modifiers: ['Extra Cheese'] },
        { name: 'Seasoned Fries', qty: 2, price: 4.99, modifiers: [] },
      ],
    },
    {
      id: 'WR-1002', type: 'takeout', status: 'pending',
      createdAt: new Date(Date.now() - 3 * 60000).toISOString(),
      items: [
        { name: 'Spicy Beef Wrap', qty: 1, price: 13.99, modifiers: ['No Onions', 'Spicy Mayo'] },
        { name: 'Fountain Drink', qty: 1, price: 2.99, modifiers: [] },
      ],
    },
    {
      id: 'WR-1003', type: 'dine-in', table: 5, status: 'preparing',
      createdAt: new Date(Date.now() - 12 * 60000).toISOString(),
      items: [
        { name: 'Teriyaki Salmon Roll', qty: 1, price: 15.99, modifiers: [] },
        { name: 'Fresh Juice', qty: 2, price: 4.49, modifiers: [] },
      ],
    },
    {
      id: 'WR-1004', type: 'dine-in', table: 10, status: 'pending',
      createdAt: new Date(Date.now() - 1 * 60000).toISOString(),
      items: [
        { name: 'Veggie Supreme Wrap', qty: 1, price: 10.99, modifiers: ['Extra Cheese'] },
        { name: 'Classic Chicken Roll', qty: 2, price: 9.99, modifiers: [] },
        { name: 'Onion Rings', qty: 1, price: 5.49, modifiers: [] },
      ],
    },
    {
      id: 'WR-1005', type: 'delivery', customer: 'Amina H.', status: 'ready',
      createdAt: new Date(Date.now() - 18 * 60000).toISOString(),
      items: [{ name: 'BBQ Chicken Wrap', qty: 3, price: 11.99, modifiers: ['Bacon'] }],
    },
  ];

  const insertOrder = db.prepare(`
    INSERT INTO orders (id, order_type, table_number, customer_name, delivery_address, subtotal, tax, total, payment_method, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, name, qty, price, modifiers) VALUES (?, ?, ?, ?, ?)
  `);

  for (const o of orders) {
    const subtotal = o.items.reduce((s, i) => s + i.price * i.qty, 0);
    const tax = subtotal * 0.08;
    const total = subtotal + tax;
    insertOrder.run(
      o.id, o.type, o.table || null, o.customer || null, null,
      subtotal, tax, total, 'cash', o.status, o.createdAt, o.createdAt
    );
    for (const item of o.items) {
      insertItem.run(o.id, item.name, item.qty, item.price, JSON.stringify(item.modifiers));
    }
  }

  db.prepare('UPDATE order_items SET price = price * 2500').run();
  db.prepare('UPDATE orders SET subtotal = subtotal * 2500, tax = tax * 2500, total = total * 2500').run();

  db.prepare('UPDATE order_counter SET next_id = 1006 WHERE id = 1').run();
}
