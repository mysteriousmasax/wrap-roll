import { syncMenuCatalog, default as menuCatalog } from './menu-catalog.js';

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
  ['Cabbage', 14, 'kg', 8, 'Fresh Farms', '2026-08-23', '', 'produce', 'CAB-11', 1800, '', 'Produce chiller'],
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
  ['Moses Mtafu', 'Trainer', 'Morning', 'on-clock', '08:00', 'MM', '+255712999101'],
];

const trainingRows = [
  ['Grace Kimaro', 'POS operations', 'Amina Mohamed', '2026-08-12', 'completed', 96, 'Handled mobile-money checkout flow and refunds.'],
  ['David Ochieng', 'Food safety & kitchen prep', 'Moses Mtafu', '2026-08-18', 'completed', 91, 'Covered temperature control and cross-contamination prevention.'],
  ['Brian Kato', 'Inventory receiving', 'Amina Mohamed', '2026-08-20', 'completed', 88, 'Reviewed stock count, threshold alerts, and receiving records.'],
  ['Esther Nyambura', 'Customer service & upselling', 'Amina Mohamed', '2026-08-14', 'completed', 93, 'Practiced complaint handling and combo recommendations.'],
  ['Tom Baraka', 'Kitchen display workflow', 'David Ochieng', '2026-08-16', 'completed', 90, 'Covered KDS order timing and priority management.'],
  ['Joel Nyerere', 'Delivery protocol', 'Amina Mohamed', '2026-08-21', 'completed', 85, 'Reviewed route efficiency, packaging, and customer call etiquette.'],
  ['Alice Marwa', 'Cash handling & reconciliation', 'Amina Mohamed', '2026-08-24', 'completed', 89, 'Closed register balancing and drawer reconciliation.'],
];

const customerRows = [
  ['Amina Hassan', 'VIP', 12450, '["Veggie Wrap","Fresh Juice (Seasonal)"]', '2026-08-14', '+255712345678', 'amina.hassan@gmail.com', 89, 0],
  ['John Kimani', 'VIP', 9820, '["Grilled Chicken Tandoori Wrap","Iced Tea Mint"]', '2026-08-15', '+255713456789', 'john.kimani@gmail.com', 67, 0],
  ['Faith Wanjiku', 'Regular', 4560, '["Veggie Supreme Wrap"]', '2026-07-10', '+255714567890', 'faith.wanjiku@yahoo.com', 34, 1],
  ['Peter Omondi', 'Regular', 3890, '["Classic Chicken Roll","Small Chips"]', '2026-06-28', '+255715678901', 'peter.omondi@gmail.com', 28, 1],
  ['Zainab Mohammed', 'Gold', 7650, '["House Salad - All Toppings","Fresh Juice (Seasonal)"]', '2026-08-13', '+255716789012', 'zainab.mohammed@gmail.com', 52, 0],
  ['Samuel Eriku', 'Regular', 2340, '["Sweet/BBQ Chicken Wrap"]', '2026-08-11', '+255717890123', 'samuel.eriku@gmail.com', 18, 0],
  ['Nora Kisaka', 'Gold', 8900, '["Chicken Pizza","Cappuccino"]', '2026-08-12', '+255718901234', 'nora.kisaka@gmail.com', 48, 0],
  ['Paul Kilele', 'Regular', 5300, '["Beef Burger","Soda 600ml"]', '2026-08-13', '+255719012345', 'paul.kilele@yahoo.com', 31, 0],
  ['Lucy Mrema', 'VIP', 10250, '["House Steak Wrap","Iced Americano"]', '2026-08-08', '+255720123456', 'lucy.mrema@gmail.com', 71, 0],
  ['George Mlay', 'Regular', 6600, '["Veggie Roll - Full","Water 500ml"]', '2026-08-09', '+255721234567', 'george.mlay@gmail.com', 41, 0]
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
  ['TR-2014', 'WR-2014', 'Paul Kilele', 29500, 'card', 'delivery', 'completed', '2026-08-13T19:50:00Z'],
];

const orderRows = [
  ['WR-2101', 'dine-in', 4, 'Amina Hassan', '+255712345678', 'amina.hassan@gmail.com', 'Mikocheni, Dar es Salaam', 22000, 3960, 25960, 'mobile_money', 'completed', '2026-08-14T18:40:00Z', '2026-08-14T18:40:00Z', 2],
  ['WR-2102', 'delivery', null, 'John Kimani', '+255713456789', 'john.kimani@gmail.com', 'Mbezi Beach, Dar es Salaam', 18500, 3330, 21830, 'card', 'completed', '2026-08-15T12:15:00Z', '2026-08-15T12:15:00Z', 4],
  ['WR-2103', 'takeaway', null, 'Faith Wanjiku', '+255714567890', 'faith.wanjiku@yahoo.com', null, 15200, 2736, 17936, 'cash', 'completed', '2026-08-16T15:05:00Z', '2026-08-16T15:05:00Z', 3],
  ['WR-2104', 'dine-in', 7, 'Zainab Mohammed', '+255716789012', 'zainab.mohammed@gmail.com', null, 27150, 4887, 32037, 'mobile_money', 'completed', '2026-08-17T19:10:00Z', '2026-08-17T19:10:00Z', 1],
  ['WR-2105', 'delivery', null, 'Paul Kilele', '+255719012345', 'paul.kilele@yahoo.com', 'Kivukoni, Dar es Salaam', 17800, 3204, 21004, 'card', 'completed', '2026-08-18T14:00:00Z', '2026-08-18T14:00:00Z', 2],
  ['WR-2106', 'dine-in', 10, 'Lucy Mrema', '+255720123456', 'lucy.mrema@gmail.com', null, 34400, 6192, 40592, 'mobile_money', 'completed', '2026-08-19T20:30:00Z', '2026-08-19T20:30:00Z', 5],
  ['WR-2107', 'takeaway', null, 'George Mlay', '+255721234567', 'george.mlay@gmail.com', null, 12800, 2304, 15104, 'cash', 'completed', '2026-08-20T11:50:00Z', '2026-08-20T11:50:00Z', 6],
  ['WR-2108', 'delivery', null, 'Nora Kisaka', '+255718901234', 'nora.kisaka@gmail.com', 'Upanga, Dar es Salaam', 24200, 4356, 28556, 'card', 'completed', '2026-08-21T18:25:00Z', '2026-08-21T18:25:00Z', 2]
];

const orderItemRows = [
  ['WR-2101', 'Veggie Wrap', 2, 12500, '["Cheese (Wraps/Rolls/Salads)"]', 'extra sauce on side'],
  ['WR-2101', 'Fresh Juice (Seasonal)', 1, 9000, '[]', null],
  ['WR-2102', 'Grilled Chicken Tandoori Wrap', 1, 19000, '["Jalapenos (Wraps/Rolls/Salads)"]', 'no onions'],
  ['WR-2102', 'Iced Tea Mint', 1, 5000, '[]', null],
  ['WR-2103', 'Classic Chicken Roll', 2, 14000, '["Extra Sauce"]', 'light mayo'],
  ['WR-2103', 'Small Chips', 1, 4000, '[]', null],
  ['WR-2104', 'House Salad - All Toppings', 2, 24000, '["Olives (Wraps/Rolls/Salads)","Cheese (Wraps/Rolls/Salads)"]', 'add avocado'],
  ['WR-2104', 'Cappuccino', 1, 6500, '[]', 'extra hot'],
  ['WR-2105', 'Beef Burger', 1, 12500, '["Mozzarella/Sliced Cheddar Cheese"]', 'well done'],
  ['WR-2105', 'Soda 600ml', 1, 3000, '[]', null],
  ['WR-2106', 'House Steak Wrap', 2, 20000, '["Avocado"]', 'extra sauce'],
  ['WR-2106', 'Iced Americano', 2, 5500, '[]', null],
  ['WR-2107', 'Veggie Roll - Full', 1, 13000, '["Olives (Wraps/Rolls/Salads)"]', null],
  ['WR-2107', 'Water 500ml', 1, 1500, '[]', null],
  ['WR-2108', 'Chicken Pizza', 1, 12500, '["Mozzarella/Sliced Cheddar Cheese","Mushrooms"]', 'thin crust'],
  ['WR-2108', 'Cappuccino', 1, 6500, '[]', 'extra milk']
];

const shiftLogs = [
  ['Grace Kimaro', '2026-08-14', '07:00', '15:00', 8, 'completed', 'Cash counter with peak lunch period coverage'],
  ['David Ochieng', '2026-08-14', '06:30', '14:30', 8, 'completed', 'Kitchen prep and lunch rush management'],
  ['Esther Nyambura', '2026-08-14', '07:15', '15:15', 8, 'completed', 'Front-of-house serving and upselling focus'],
  ['Amina Mohamed', '2026-08-14', '08:00', '16:00', 8, 'completed', 'Supervisor checks and stock reconciliation'],
  ['Joel Nyerere', '2026-08-14', '15:00', '23:00', 8, 'completed', 'Delivery and dispatch supervision'],
  ['Grace Kimaro', '2026-08-15', '07:00', '15:00', 8, 'completed', 'Cash counter and end-of-shift reconciliation'],
  ['Tom Baraka', '2026-08-15', '06:45', '14:45', 8, 'completed', 'Hot line preparation and order handoff'],
  ['Alice Marwa', '2026-08-15', '15:30', '22:30', 7, 'completed', 'Evening cash desk coverage']
];

const payrollRows = [
  ['Grace Kimaro', '2026-08', 260000, 15000, 8000, 5000, 283000, 'approved'],
  ['David Ochieng', '2026-08', 320000, 22000, 12000, 6000, 346000, 'approved'],
  ['Esther Nyambura', '2026-08', 245000, 18000, 9000, 4000, 258000, 'approved'],
  ['Amina Mohamed', '2026-08', 360000, 26000, 15000, 7000, 398000, 'approved'],
  ['Joel Nyerere', '2026-08', 230000, 12000, 6000, 3000, 245000, 'approved'],
  ['Tom Baraka', '2026-08', 220000, 16000, 5000, 2500, 234500, 'approved'],
  ['Alice Marwa', '2026-08', 220000, 10000, 7000, 2000, 241000, 'approved']
];

const monthlySales = [
  ['Jan', 89200, 2340, 21400],
  ['Feb', 94500, 2510, 23200],
  ['Mar', 102300, 2680, 25800],
  ['Apr', 98700, 2590, 24100],
  ['May', 115600, 2890, 29500],
  ['Jun', 108400, 2750, 27200],
  ['Jul', 121800, 3120, 31400],
  ['Aug', 134200, 3380, 34800],
];

const settings = [
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
  ['public_animation_enabled', 'true'],
  ['public_animation_style', 'lift'],
  ['public_animation_duration', '650'],
  ['public_animation_replay', 'true'],
];

const legacyFixtureNames = new Set([
  'TEST ITEM', 'Large Soda, 1.2L', 'Medium Soda, 600mL', 'Small Soda, 300mL', 'Americano Black', 'Tea Bags',
  'Mayonnaise', 'BBQ Chicken', 'Cheddar Cheese', 'Chicken Strips', 'Milk', 'Minced Beef Burger', 'Minced Chicken Burger',
  'Mozarella Cheese', 'Pastrami', 'Prestige Butter', 'Sausage', 'Sliced Cheddar Cheese', 'Smoked Beef', 'Steak',
  'Strawberry Ice Cream', 'Sweet Chicken', 'Tikka (Tandoori)', 'Tuna', 'Vanilla Ice Cream', 'Yoghurt', 'Brown Vinegar',
  'Caramel Sauce', 'Chocolate Sauce', 'Honey', 'Honey Mustard', 'Hot Chili Sauce', 'Ketchup Tomato', 'Mustard',
  'Olive Oil', 'Pizza Sauce', 'Sweet Onion', 'Thousand Island', 'Tomato Satchets', 'Vinegar', 'Avocado', 'Carrots',
  'Cooking Oil Fries', 'Cucumber', 'Green Pepper', 'Jalapenos', 'Lemons', 'Lettuce', 'Mint', 'Mushrooms', 'Olives',
  'Onions', 'Pickles', 'Pili Pili Mbuzi', 'Pineapple', 'Potatoes', 'Tomato (Veggie)', 'Black Pepper', 'Bread Crumbs',
  'Coffee Ground', 'Coriander', 'Flour/ Dough', 'Ginger & Garlic', 'Kimbo', 'Oregano', 'Salt', 'Sesame Seed',
  'Sugar', 'Sugar Satchets', 'Table Salt', 'Wheat Flour', 'Yeast'
]);

function purgeLegacyFixtures(db) {
  const names = Array.from(legacyFixtureNames);
  const menuDeleted = db.prepare('DELETE FROM menu_items WHERE name IN (' + names.map(() => '?').join(',') + ')').run(...names).changes;
  const inventoryDeleted = db.prepare('DELETE FROM inventory WHERE name IN (' + names.map(() => '?').join(',') + ')').run(...names).changes;
  db.prepare('DELETE FROM menu_items WHERE name LIKE ?').run('%TEST%');
  db.prepare('DELETE FROM inventory WHERE lower(name) LIKE ?').run('%test%');

  return { menuDeleted, inventoryDeleted };
}

function ensureDocumentSchema(db) {
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
      popular INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
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
      at_risk INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      menu_item_id INTEGER,
      name TEXT NOT NULL,
      qty INTEGER NOT NULL,
      price REAL NOT NULL,
      modifiers TEXT DEFAULT '[]',
      special_instructions TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
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
  `);
}

export function seedFromDocuments(db) {
  ensureDocumentSchema(db);
  const purgeResult = purgeLegacyFixtures(db);
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const insertUser = db.prepare('INSERT INTO users (name, role, pin, avatar) VALUES (?, ?, ?, ?)');
    for (const user of [
      ['Adila Ismail', 'admin', '1234', 'AI'],
      ['Grace Kimaro', 'foh', '2345', 'GK'],
      ['David Ochieng', 'kitchen', '3456', 'DO'],
      ['Emmanuel Makaya', 'manager', '4567', 'EM'],
      ['Michael Otieno', 'executive', '5678', 'MO'],
    ]) {
      insertUser.run(user[0], user[1], user[2], user[3]);
    }
  }

  const maxOrderStaffId = Math.max(0, ...orderRows.map((row) => Number(row[14] ?? 0)));
  const existingMaxUserId = db.prepare('SELECT MAX(id) AS max_id FROM users').get()?.max_id ?? 0;
  if (existingMaxUserId < maxOrderStaffId) {
    const insertUser = db.prepare('INSERT INTO users (name, role, pin, avatar) VALUES (?, ?, ?, ?)');
    for (let i = existingMaxUserId + 1; i <= maxOrderStaffId; i += 1) {
      insertUser.run(`Operations Staff ${i}`, 'support', String(i).padStart(4, '0'), `OS${i}`);
    }
  }

  const writeMenu = db.prepare('SELECT id FROM menu_items WHERE name = ?');
  const updateMenu = db.prepare('UPDATE menu_items SET description = ?, price = ?, category = ?, image = ?, popular = ?, active = 1 WHERE id = ?');
  const insertMenu = db.prepare('INSERT INTO menu_items (name, description, price, category, image, popular, active) VALUES (?, ?, ?, ?, ?, ?, 1)');

  for (const item of menuCatalog) {
    const existing = writeMenu.get(item.name);
    if (existing) updateMenu.run(item.description, item.price, item.category, item.image, item.popular ? 1 : 0, existing.id);
    else insertMenu.run(item.name, item.description, item.price, item.category, item.image, item.popular ? 1 : 0);
  }

  const inventoryUpsert = db.prepare('SELECT id FROM inventory WHERE name = ?');
  const updateInventory = db.prepare('UPDATE inventory SET quantity = ?, unit = ?, threshold = ?, supplier = ?, last_restocked = ?, image_url = ?, category = ?, sku = ?, unit_cost = ?, expiry_date = ?, storage_location = ? WHERE id = ?');
  const insertInventory = db.prepare('INSERT INTO inventory (name, quantity, unit, threshold, supplier, last_restocked, image_url, category, sku, unit_cost, expiry_date, storage_location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

  for (const row of inventoryRows) {
    const existing = inventoryUpsert.get(row[0]);
    if (existing) updateInventory.run(Number(row[1]), row[2], Number(row[3]), row[4], row[5], row[6], row[7], row[8], Number(row[9]), row[10], row[11], existing.id);
    else insertInventory.run(row[0], Number(row[1]), row[2], Number(row[3]), row[4], row[5], row[6], row[7], row[8], Number(row[9]), row[10], row[11]);
  }

  const staffUpsert = db.prepare('SELECT id FROM staff WHERE name = ? AND role = ?');
  const updateStaff = db.prepare('UPDATE staff SET shift = ?, status = ?, clock_in = ?, avatar = ?, phone = ? WHERE id = ?');
  const insertStaff = db.prepare('INSERT INTO staff (name, role, shift, status, clock_in, avatar, phone) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const row of staffRows) {
    const existing = staffUpsert.get(row[0], row[1]);
    if (existing) updateStaff.run(row[2], row[3], row[4], row[5], row[6], existing.id);
    else insertStaff.run(...row);
  }

  const trainingUpsert = db.prepare('SELECT id FROM training_records WHERE staff_name = ? AND topic = ? AND training_date = ?');
  const updateTraining = db.prepare('UPDATE training_records SET trainer = ?, status = ?, score = ?, notes = ? WHERE id = ?');
  const insertTraining = db.prepare('INSERT INTO training_records (staff_name, topic, trainer, training_date, status, score, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const row of trainingRows) {
    const existing = trainingUpsert.get(row[0], row[1], row[3]);
    if (existing) updateTraining.run(row[2], row[4], row[5], row[6], existing.id);
    else insertTraining.run(...row);
  }

  const customerUpsert = db.prepare('SELECT id FROM customers WHERE phone = ?');
  const updateCustomer = db.prepare('UPDATE customers SET tier = ?, lifetime_value = ?, favorite_items = ?, last_visit = ?, email = ?, visits = ?, at_risk = ? WHERE id = ?');
  const insertCustomer = db.prepare('INSERT INTO customers (name, tier, lifetime_value, favorite_items, last_visit, phone, email, visits, at_risk) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of customerRows) {
    const existing = customerUpsert.get(row[5]);
    if (existing) updateCustomer.run(row[1], row[2], row[3], row[4], row[6], row[7], row[8], existing.id);
    else insertCustomer.run(row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8]);
  }

  const txUpsert = db.prepare('SELECT id FROM sales_transactions WHERE id = ?');
  const updateTx = db.prepare('UPDATE sales_transactions SET order_id = ?, customer_name = ?, amount = ?, payment_method = ?, channel = ?, status = ?, created_at = ? WHERE id = ?');
  const insertTx = db.prepare('INSERT INTO sales_transactions (id, order_id, customer_name, amount, payment_method, channel, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of salesRows) {
    const existing = txUpsert.get(row[0]);
    if (existing) updateTx.run(row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[0]);
    else insertTx.run(...row);
  }

  const orderUpsert = db.prepare('SELECT id FROM orders WHERE id = ?');
  const updateOrder = db.prepare('UPDATE orders SET order_type = ?, table_number = ?, customer_name = ?, customer_phone = ?, customer_email = ?, delivery_address = ?, subtotal = ?, tax = ?, total = ?, payment_method = ?, status = ?, created_at = ?, updated_at = ?, staff_id = ? WHERE id = ?');
  const insertOrder = db.prepare('INSERT INTO orders (id, order_type, table_number, customer_name, customer_phone, customer_email, delivery_address, subtotal, tax, total, payment_method, status, created_at, updated_at, staff_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of orderRows) {
    const existing = orderUpsert.get(row[0]);
    const requestedStaffId = Number(row[14] ?? 0);
    const safeStaffId = db.prepare('SELECT id FROM users WHERE id = ?').get(requestedStaffId)?.id ?? db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()?.id ?? null;
    if (existing) updateOrder.run(row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10], row[11], row[12], row[13], safeStaffId, row[0]);
    else insertOrder.run(row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10], row[11], row[12], row[13], safeStaffId);
  }

  const menuLookup = db.prepare('SELECT id, name FROM menu_items WHERE name = ?');
  const orderItemUpsert = db.prepare('SELECT id FROM order_items WHERE order_id = ? AND name = ?');
  const insertOrderItem = db.prepare('INSERT INTO order_items (order_id, menu_item_id, name, qty, price, modifiers, special_instructions) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const row of orderItemRows) {
    const item = menuLookup.get(row[1]);
    const existing = orderItemUpsert.get(row[0], row[1]);
    if (!existing) insertOrderItem.run(row[0], item?.id ?? null, row[1], Number(row[2]), Number(row[3]), row[4], row[5]);
  }

  const paymentUpsert = db.prepare('SELECT id FROM payments WHERE order_id = ?');
  const updatePayment = db.prepare('UPDATE payments SET amount = ?, currency = ?, payment_method = ?, status = ?, initiated_at = ?, updated_at = ? WHERE id = ?');
  const insertPayment = db.prepare('INSERT INTO payments (id, order_id, amount, currency, payment_method, status, initiated_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of orderRows) {
    const paymentId = `PMT-${row[0].replace('WR-', '')}`;
    const existing = paymentUpsert.get(row[0]);
    if (existing) updatePayment.run(Number(row[9]), 'TZS', row[10], row[11], row[12], row[13], existing.id);
    else insertPayment.run(paymentId, row[0], Number(row[9]), 'TZS', row[10], row[11], row[12], row[13]);
  }

  const shiftUpsert = db.prepare('SELECT id FROM shift_logs WHERE staff_name = ? AND shift_date = ?');
  const insertShift = db.prepare('INSERT INTO shift_logs (staff_id, staff_name, shift_date, start_time, end_time, hours_worked, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of shiftLogs) {
    const staffRecord = db.prepare('SELECT id FROM staff WHERE name = ?').get(row[0]);
    const existing = shiftUpsert.get(row[0], row[1]);
    if (!existing && staffRecord) insertShift.run(staffRecord.id, row[0], row[1], row[2], row[3], Number(row[4]), row[5], row[6]);
  }

  const payrollUpsert = db.prepare('SELECT id FROM payroll_records WHERE staff_name = ? AND pay_period = ?');
  const insertPayroll = db.prepare('INSERT INTO payroll_records (staff_id, staff_name, pay_period, basic_pay, overtime, allowances, deductions, net_pay, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of payrollRows) {
    const staffRecord = db.prepare('SELECT id FROM staff WHERE name = ?').get(row[0]);
    const existing = payrollUpsert.get(row[0], row[1]);
    if (!existing && staffRecord) insertPayroll.run(staffRecord.id, row[0], row[1], Number(row[2]), Number(row[3]), Number(row[4]), Number(row[5]), Number(row[6]), row[7], new Date().toISOString());
  }

  const monthlyUpsert = db.prepare('SELECT id FROM sales_monthly WHERE month = ?');
  const updateMonthly = db.prepare('UPDATE sales_monthly SET revenue = ?, orders_count = ?, profit = ? WHERE id = ?');
  const insertMonthly = db.prepare('INSERT INTO sales_monthly (month, revenue, orders_count, profit) VALUES (?, ?, ?, ?)');
  for (const row of monthlySales) {
    const existing = monthlyUpsert.get(row[0]);
    if (existing) updateMonthly.run(Number(row[1]), Number(row[2]), Number(row[3]), existing.id);
    else insertMonthly.run(row[0], Number(row[1]), Number(row[2]), Number(row[3]));
  }

  const settingUpsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [key, value] of settings) settingUpsert.run(key, String(value));

  const counter = db.prepare('SELECT id FROM order_counter WHERE id = 1');
  if (!counter.get()) db.prepare('INSERT INTO order_counter (id, next_id) VALUES (1, 1001)').run();

  return {
    purgeLegacyFixtures: purgeResult,
    menuCount: db.prepare('SELECT COUNT(*) AS c FROM menu_items').get().c,
    inventoryCount: db.prepare('SELECT COUNT(*) AS c FROM inventory').get().c,
    staffCount: db.prepare('SELECT COUNT(*) AS c FROM staff').get().c,
    trainingCount: db.prepare('SELECT COUNT(*) AS c FROM training_records').get().c,
    salesCount: db.prepare('SELECT COUNT(*) AS c FROM sales_transactions').get().c,
    monthlySalesCount: db.prepare('SELECT COUNT(*) AS c FROM sales_monthly').get().c,
    settingsCount: db.prepare('SELECT COUNT(*) AS c FROM settings').get().c,
  };
}

export default { seedFromDocuments, menuCatalog, inventoryRows, staffRows, trainingRows, salesRows, settings };
