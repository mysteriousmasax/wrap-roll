const imageByCategory = {
  wraps: 'https://wrapandrolltz.com/uploads/photo_gallery/d706fc0ef56440dd131465fd75aae870.jpg',
  salads: 'https://images.unsplash.com/photo-1512621776951-a57141f2eecd?w=600&h=600&fit=crop',
  rolls: 'https://wrapandrolltz.com/uploads/photo_gallery/c24c7b3e15ad597021def8b940058a69.jpg',
  pizzas: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&h=600&fit=crop',
  burgers: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=600&fit=crop',
  extras: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&h=600&fit=crop',
  combos: 'https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=600&h=600&fit=crop',
  coffee: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&h=600&fit=crop',
  'cold-drinks': 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&h=600&fit=crop',
  'soft-drinks': 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=600&h=600&fit=crop',
};

const menuCatalog = [
  ['Veggie Wrap', 'Fresh vegetables in a soft wrap', 12500, 'wraps'],
  ['Grilled Chicken Tandoori Wrap', 'Grilled tandoori chicken, salad and sauce', 19000, 'wraps'],
  ['Grilled Chicken Lemon Wrap', 'Grilled lemon chicken, salad and sauce', 19000, 'wraps'],
  ['House Steak Wrap', 'House steak, fresh vegetables and sauce', 20000, 'wraps'],
  ['Smoked Beef Wrap', 'Smoked beef, fresh vegetables and sauce', 20000, 'wraps'],
  ['Pastrami Beef Wrap', 'Pastrami beef, fresh vegetables and sauce', 20000, 'wraps'],
  ['Classic Tuna Wrap', 'Classic tuna, fresh vegetables and sauce', 20000, 'wraps'],
  ['Sweet/BBQ Chicken Wrap', 'Sweet or BBQ chicken, fresh salad and sauce', 19000, 'wraps'],
  ['Veggie Salad', 'Fresh vegetables and house dressing', 12500, 'salads'],
  ['Grilled Chicken Tandoori Salad', 'Fresh salad with grilled tandoori chicken', 19000, 'salads'],
  ['Grilled Chicken Lemon Salad', 'Fresh salad with grilled lemon chicken', 19000, 'salads'],
  ['House Steak Salad', 'Fresh salad with house steak', 20000, 'salads'],
  ['Smoked Beef Salad', 'Fresh salad with smoked beef', 20000, 'salads'],
  ['Pastrami Beef Salad', 'Fresh salad with pastrami beef', 20000, 'salads'],
  ['Classic Tuna Salad', 'Fresh salad with classic tuna', 19000, 'salads'],
  ['Sweet/BBQ Chicken Salad', 'Fresh salad with sweet or BBQ chicken', 19000, 'salads'],
  ['House Salad - All Toppings', 'All vegetables plus meat, jalapenos and olives', 24000, 'salads'],
  ['Veggie Roll - Half', 'White, cheese or herbs bread with veggie filling', 7000, 'rolls'],
  ['Veggie Roll - Full', 'White, cheese or herbs bread with veggie filling', 13000, 'rolls'],
  ['Grilled Chicken Tandoori Roll - Half', 'Tandoori chicken roll on your choice of bread', 13000, 'rolls'],
  ['Grilled Chicken Tandoori Roll - Full', 'Tandoori chicken roll on your choice of bread', 24000, 'rolls'],
  ['Grilled Lemon Chicken Roll - Half', 'Lemon chicken roll on your choice of bread', 13000, 'rolls'],
  ['Grilled Lemon Chicken Roll - Full', 'Lemon chicken roll on your choice of bread', 24000, 'rolls'],
  ['Sweet/BBQ Chicken Roll - Half', 'Sweet or BBQ chicken roll on your choice of bread', 13000, 'rolls'],
  ['Sweet/BBQ Chicken Roll - Full', 'Sweet or BBQ chicken roll on your choice of bread', 25000, 'rolls'],
  ['House Steak Roll - Half', 'House steak roll on your choice of bread', 14000, 'rolls'],
  ['House Steak Roll - Full', 'House steak roll on your choice of bread', 25000, 'rolls'],
  ['Smoked Beef Roll - Half', 'Smoked beef roll on your choice of bread', 14000, 'rolls'],
  ['Smoked Beef Roll - Full', 'Smoked beef roll on your choice of bread', 25000, 'rolls'],
  ['Pastrami Beef Roll - Half', 'Pastrami beef roll on your choice of bread', 14000, 'rolls'],
  ['Pastrami Beef Roll - Full', 'Pastrami beef roll on your choice of bread', 25000, 'rolls'],
  ['Classic Tuna Roll - Half', 'Classic tuna roll on your choice of bread', 14000, 'rolls'],
  ['Classic Tuna Roll - Full', 'Classic tuna roll on your choice of bread', 25000, 'rolls'],
  ['Olives (Wraps/Rolls/Salads)', 'Add-on for wraps, rolls and salads', 1500, 'extras'],
  ['Cheese (Wraps/Rolls/Salads)', 'Add-on for wraps, rolls and salads', 1500, 'extras'],
  ['Jalapenos (Wraps/Rolls/Salads)', 'Add-on for wraps, rolls and salads', 1500, 'extras'],
  ['Chicken/Tuna', 'Add-on protein for wraps, rolls and salads', 6000, 'extras'],
  ['Pastrami/Smoked/Tuna', 'Add-on protein for wraps, rolls and salads', 6500, 'extras'],
  ['Avocado', 'Seasonal avocado add-on', 1500, 'extras'],
  ['Extra Sauce', 'Any extra sauce above five sauces', 700, 'extras'],
  ['Chicken Pizza', 'Chicken pizza', 12500, 'pizzas'],
  ['Chicken and Mushroom Pizza', 'Chicken and mushroom pizza', 12500, 'pizzas'],
  ['Hawaiian Chicken Pizza (Seasonal)', 'Seasonal Hawaiian chicken pizza', 12500, 'pizzas'],
  ['Steak Pizza', 'Steak pizza', 12500, 'pizzas'],
  ['Russian Beef Sausage Pizza', 'Russian beef sausage pizza', 12500, 'pizzas'],
  ['Meaty Lovers', 'Meaty lovers pizza', 19000, 'pizzas'],
  ['Veggie Delight', 'Vegetable pizza', 10000, 'pizzas'],
  ['Beef Burger', 'Beef burger with cheese; jalapenos available as an extra', 12500, 'burgers'],
  ['Chicken Burger', 'Chicken burger with cheese', 9000, 'burgers'],
  ['2x Beef Burger', 'Two beef burgers', 18000, 'burgers'],
  ['Make It a Meal', 'Add 600ml soda and small chips', 7000, 'combos'],
  ['Beef/Chicken Burger Meal', 'Burger with 600ml soda', 13000, 'combos'],
  ['Beef/Chicken Burger Combo', 'Burger, small fries and 600ml soda', 17000, 'combos'],
  ['Chicken Roll Lunchbox', 'Half roll, small fries and 600ml soda', 17000, 'combos'],
  ['Chicken Wrap Combo', 'Sweet/BBQ wrap, small fries and 300ml soda', 22000, 'combos'],
  ['Burger and Pizza Combo', 'Burger, medium pizza, two small fries and two 300ml sodas', 34000, 'combos'],
  ['FootLong Roll Combo', 'Full BBQ chicken roll, medium fries and two small 300ml sodas', 31000, 'combos'],
  ['2 x Pizza Combo', 'Two medium pizzas, medium fries and two 600ml sodas', 42000, 'combos'],
  ['Pizza + 2x Burger Combo', 'Medium pizza, two burgers, two small fries and three 300ml sodas', 48000, 'combos'],
  ['Family Combo Package', 'Two large pizzas, two burgers, two medium fries and 1.25L soda', 74000, 'combos'],
  ['Mozzarella/Sliced Cheddar Cheese', 'Extra cheese', 3000, 'extras'],
  ['Extra Meat Pizza', 'Extra pizza meat', 4000, 'extras'],
  ['Small Chips', 'Small serving of chips', 4000, 'extras'],
  ['Medium Chips', 'Medium serving of chips', 6500, 'extras'],
  ['Large Chips', 'Large serving of chips', 10000, 'extras'],
  ['Burger Patty', 'Extra burger patty', 4000, 'extras'],
  ['Mushrooms', 'Mushroom topping', 4000, 'extras'],
  ['Pineapple (Seasonal)', 'Seasonal pineapple topping', 4000, 'extras'],
  ['Americano Black', 'Espresso with hot water', 5500, 'coffee'],
  ['Americano White', 'Americano with milk', 6500, 'coffee'],
  ['Cappuccino', 'Espresso with steamed milk and foam', 6500, 'coffee'],
  ['Latte', 'Espresso with steamed milk', 7500, 'coffee'],
  ['Espresso', 'Rich single espresso', 4000, 'coffee'],
  ['Black Tea', 'Hot black tea', 3500, 'coffee'],
  ['Milk Tea', 'Tea with milk', 5500, 'coffee'],
  ['Hot Chocolate', 'Rich hot chocolate', 6000, 'coffee'],
  ['Honey', 'Honey serving', 500, 'coffee'],
  ['Iced Lattes', 'Chilled latte', 8000, 'cold-drinks'],
  ['Iced Americano', 'Chilled americano', 5500, 'cold-drinks'],
  ['Iced Cappuccino', 'Chilled cappuccino', 6500, 'cold-drinks'],
  ['Iced Lemon Tea', 'Chilled lemon tea', 6000, 'cold-drinks'],
  ['Iced Tea Mint', 'Chilled mint tea', 5000, 'cold-drinks'],
  ['Fresh Juice (Seasonal)', 'Seasonal fresh juice', 9000, 'cold-drinks'],
  ['Water 500ml', '500ml bottled water', 1500, 'soft-drinks'],
  ['Soda 600ml', '600ml soda', 3000, 'soft-drinks'],
  ['Soda 1.25L', '1.25L soda', 5000, 'soft-drinks'],
  ['Soda 300ml', '300ml soda', 1500, 'soft-drinks'],
].map(([name, description, price, category], index) => ({
  name,
  description,
  price,
  category,
  image: imageByCategory[category],
  popular: index < 8 ? 1 : 0,
}));

export function syncMenuCatalog(db) {
  const existing = db.prepare('SELECT id, name FROM menu_items').all();
  const existingByName = new Map(existing.map((item) => [item.name, item.id]));
  const update = db.prepare('UPDATE menu_items SET description = ?, price = ?, category = ?, image = ?, popular = ?, active = 1 WHERE id = ?');
  const insert = db.prepare('INSERT INTO menu_items (name, description, price, category, image, popular, active) VALUES (?, ?, ?, ?, ?, ?, 1)');
  const activeNames = new Set(menuCatalog.map((item) => item.name));
  const deactivate = db.prepare('UPDATE menu_items SET active = 0 WHERE name = ?');
  const transaction = db.transaction(() => {
    for (const item of menuCatalog) {
      const id = existingByName.get(item.name);
      if (id) update.run(item.description, item.price, item.category, item.image, item.popular, id);
      else insert.run(item.name, item.description, item.price, item.category, item.image, item.popular);
    }
    for (const item of existing) if (!activeNames.has(item.name)) deactivate.run(item.name);
  });
  transaction();
}

export default menuCatalog;
