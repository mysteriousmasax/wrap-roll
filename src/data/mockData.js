export const menuItems = [
  { id: 1, name: 'Signature Chicken Wrap', description: 'Crispy chicken, fresh veggies, signature sauce', price: 12.49, category: 'wraps', image: 'https://images.unsplash.com/photo-1626700051175-68adf18b0e03?w=300&h=300&fit=crop', popular: true },
  { id: 2, name: 'Spicy Beef Wrap', description: 'Seasoned beef, jalapenos, chipotle mayo', price: 13.99, category: 'wraps', image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=300&h=300&fit=crop', popular: false },
  { id: 3, name: 'Veggie Supreme Wrap', description: 'Grilled halloumi, roasted vegetables, hummus', price: 10.99, category: 'wraps', image: 'https://images.unsplash.com/photo-1540914124281-342587941389?w=300&h=300&fit=crop', popular: false },
  { id: 4, name: 'BBQ Chicken Wrap', description: 'Smoky BBQ sauce, grilled chicken, coleslaw', price: 11.99, category: 'wraps', image: 'https://images.unsplash.com/photo-1600335895229-3bf8a2b66c0e?w=300&h=300&fit=crop', popular: true },
  { id: 5, name: 'Classic Chicken Roll', description: 'Tender chicken strips, lettuce, tomato, ranch', price: 9.99, category: 'rolls', image: 'https://images.unsplash.com/photo-1551782450-17144efb9c50?w=300&h=300&fit=crop', popular: true },
  { id: 6, name: 'Teriyaki Salmon Roll', description: 'Glazed salmon, avocado, pickled ginger', price: 15.99, category: 'rolls', image: 'https://images.unsplash.com/photo-1553621042-f6e147245754?w=300&h=300&fit=crop', popular: false },
  { id: 7, name: 'Falafel Roll', description: 'Crispy falafel, tahini, fresh herbs', price: 8.99, category: 'rolls', image: 'https://images.unsplash.com/photo-1529059965260-4f35ca55cb38?w=300&h=300&fit=crop', popular: false },
  { id: 8, name: 'Spicy Tuna Roll', description: 'Fresh tuna, spicy mayo, cucumber, sesame', price: 14.49, category: 'rolls', image: 'https://images.unsplash.com/photo-1617196034796-73dfa7bfe278?w=300&h=300&fit=crop', popular: true },
  { id: 9, name: 'Seasoned Fries', description: 'Crispy golden fries with house seasoning', price: 4.99, category: 'sides', image: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=300&h=300&fit=crop', popular: true },
  { id: 10, name: 'Onion Rings', description: 'Beer-battered onion rings with dipping sauce', price: 5.49, category: 'sides', image: 'https://images.unsplash.com/photo-1639024471283-03518883512d?w=300&h=300&fit=crop', popular: false },
  { id: 11, name: 'Coleslaw', description: 'Creamy homemade coleslaw', price: 3.49, category: 'sides', image: 'https://images.unsplash.com/photo-1625938145312-a5738b8762f4?w=300&h=300&fit=crop', popular: false },
  { id: 12, name: 'Sweet Potato Fries', description: 'Crispy sweet potato fries with aioli', price: 5.99, category: 'sides', image: 'https://images.unsplash.com/photo-1598662922294-9e1a3d085a5c?w=300&h=300&fit=crop', popular: false },
  { id: 13, name: 'Fountain Drink', description: 'Coke, Sprite, Fanta, or Diet Coke', price: 2.99, category: 'drinks', image: 'https://images.unsplash.com/photo-1581636625402-29b2a704ef13?w=300&h=300&fit=crop', popular: false },
  { id: 14, name: 'Fresh Juice', description: 'Mango, Passion, Orange, or Pineapple', price: 4.49, category: 'drinks', image: 'https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=300&h=300&fit=crop', popular: true },
  { id: 15, name: 'Iced Tea', description: 'Classic or Peach flavored', price: 3.49, category: 'drinks', image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=300&h=300&fit=crop', popular: false },
  { id: 16, name: 'Milkshake', description: 'Vanilla, Chocolate, or Strawberry', price: 6.49, category: 'drinks', image: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=300&h=300&fit=crop', popular: false },
];

export const modifiers = [
  { id: 1, name: 'Extra Cheese', price: 1.00, type: 'add' },
  { id: 2, name: 'Avocado', price: 1.50, type: 'add' },
  { id: 3, name: 'Spicy Mayo', price: 0.50, type: 'add' },
  { id: 4, name: 'Extra Sauce', price: 0.50, type: 'add' },
  { id: 5, name: 'Jalapenos', price: 0.75, type: 'add' },
  { id: 6, name: 'Bacon', price: 2.00, type: 'add' },
  { id: 7, name: 'No Onions', price: 0, type: 'remove' },
  { id: 8, name: 'No Tomato', price: 0, type: 'remove' },
  { id: 9, name: 'No Sauce', price: 0, type: 'remove' },
  { id: 10, name: 'No Cheese', price: 0, type: 'remove' },
];

export const tables = [
  { id: 1, number: 1, seats: 2, status: 'available', x: 10, y: 10 },
  { id: 2, number: 2, seats: 4, status: 'occupied', x: 30, y: 10, order: 'WR-1005' },
  { id: 3, number: 3, seats: 4, status: 'available', x: 50, y: 10 },
  { id: 4, number: 4, seats: 6, status: 'reserved', x: 70, y: 10, reservation: '6:30 PM' },
  { id: 5, number: 5, seats: 2, status: 'occupied', x: 10, y: 35, order: 'WR-1003' },
  { id: 6, number: 6, seats: 4, status: 'available', x: 30, y: 35 },
  { id: 7, number: 7, seats: 8, status: 'reserved', x: 50, y: 35, reservation: '7:00 PM' },
  { id: 8, number: 8, seats: 2, status: 'cleaning', x: 70, y: 35 },
  { id: 9, number: 9, seats: 4, status: 'available', x: 10, y: 60 },
  { id: 10, number: 10, seats: 6, status: 'occupied', x: 30, y: 60, order: 'WR-1007' },
  { id: 11, number: 11, seats: 4, status: 'available', x: 50, y: 60 },
  { id: 12, number: 12, seats: 2, status: 'available', x: 70, y: 60 },
];

export const customers = [
  { id: 1, name: 'Amina Hassan', tier: 'VIP', lifetimeValue: 12450, favoriteItems: ['Signature Chicken Wrap', 'Fresh Juice'], lastVisit: '2026-08-14', phone: '+255 712 345 678', visits: 89, atRisk: false },
  { id: 2, name: 'John Kimani', tier: 'VIP', lifetimeValue: 9820, favoriteItems: ['Spicy Beef Wrap', 'Iced Tea'], lastVisit: '2026-08-15', phone: '+255 713 456 789', visits: 67, atRisk: false },
  { id: 3, name: 'Faith Wanjiku', tier: 'Regular', lifetimeValue: 4560, favoriteItems: ['Veggie Supreme Wrap'], lastVisit: '2026-07-10', phone: '+255 714 567 890', visits: 34, atRisk: true },
  { id: 4, name: 'Peter Omondi', tier: 'Regular', lifetimeValue: 3890, favoriteItems: ['Classic Chicken Roll', 'Seasoned Fries'], lastVisit: '2026-06-28', phone: '+255 715 678 901', visits: 28, atRisk: true },
  { id: 5, name: 'Zainab Mohammed', tier: 'Gold', lifetimeValue: 7650, favoriteItems: ['Teriyaki Salmon Roll', 'Mango Juice'], lastVisit: '2026-08-13', phone: '+255 716 789 012', visits: 52, atRisk: false },
  { id: 6, name: 'Samuel Eriku', tier: 'Regular', lifetimeValue: 2340, favoriteItems: ['BBQ Chicken Wrap'], lastVisit: '2026-08-11', phone: '+255 717 890 123', visits: 18, atRisk: false },
];

export const staffMembers = [
  { id: 1, name: 'Grace Kimaro', role: 'Cashier', shift: 'Morning', status: 'on-clock', clockIn: '7:00 AM', avatar: 'GK', phone: '+255 712 111 222' },
  { id: 2, name: 'David Ochieng', role: 'Head Chef', shift: 'Morning', status: 'on-clock', clockIn: '6:30 AM', avatar: 'DO', phone: '+255 712 222 333' },
  { id: 3, name: 'Brian Kato', role: 'Kitchen Staff', shift: 'Afternoon', status: 'no-show', clockIn: null, avatar: 'BK', phone: '+255 712 333 444' },
  { id: 4, name: 'Esther Nyambura', role: 'Server', shift: 'Morning', status: 'on-clock', clockIn: '7:15 AM', avatar: 'EN', phone: '+255 712 444 555' },
  { id: 5, name: 'Alice Marwa', role: 'Cashier', shift: 'Evening', status: 'off-clock', clockIn: null, avatar: 'AM', phone: '+255 712 555 666' },
  { id: 6, name: 'Tom Baraka', role: 'Kitchen Staff', shift: 'Morning', status: 'on-clock', clockIn: '6:45 AM', avatar: 'TB', phone: '+255 712 666 777' },
];

export const inventoryItems = [
  { id: 1, name: 'Chicken Breast', quantity: 45, unit: 'kg', threshold: 20, supplier: 'Fresh Farms Ltd', lastRestocked: '2026-08-14' },
  { id: 2, name: 'Beef Strips', quantity: 18, unit: 'kg', threshold: 15, supplier: 'Meat Masters', lastRestocked: '2026-08-13' },
  { id: 3, name: 'Tortilla Wraps', quantity: 200, unit: 'pcs', threshold: 100, supplier: 'Bakery Plus', lastRestocked: '2026-08-15' },
  { id: 4, name: 'Lettuce', quantity: 12, unit: 'kg', threshold: 10, supplier: 'Green Valley', lastRestocked: '2026-08-14' },
  { id: 5, name: 'Tomatoes', quantity: 25, unit: 'kg', threshold: 15, supplier: 'Green Valley', lastRestocked: '2026-08-15' },
  { id: 6, name: 'Cheese Slices', quantity: 8, unit: 'kg', threshold: 10, supplier: 'Dairy Best', lastRestocked: '2026-08-12' },
  { id: 7, name: 'Cooking Oil', quantity: 30, unit: 'liters', threshold: 15, supplier: 'Oil Express', lastRestocked: '2026-08-10' },
  { id: 8, name: 'Salmon Fillet', quantity: 5, unit: 'kg', threshold: 8, supplier: 'Ocean Catch', lastRestocked: '2026-08-13' },
  { id: 9, name: 'Potatoes', quantity: 50, unit: 'kg', threshold: 25, supplier: 'Fresh Farms Ltd', lastRestocked: '2026-08-14' },
  { id: 10, name: 'Soft Drinks', quantity: 120, unit: 'cans', threshold: 50, supplier: 'BevCo', lastRestocked: '2026-08-15' },
];

export const salesData = [
  { month: 'Jan', revenue: 89200, orders: 2340, profit: 21400 },
  { month: 'Feb', revenue: 94500, orders: 2510, profit: 23200 },
  { month: 'Mar', revenue: 102300, orders: 2680, profit: 25800 },
  { month: 'Apr', revenue: 98700, orders: 2590, profit: 24100 },
  { month: 'May', revenue: 115600, orders: 2890, profit: 29500 },
  { month: 'Jun', revenue: 108400, orders: 2750, profit: 27200 },
  { month: 'Jul', revenue: 121800, orders: 3120, profit: 31400 },
  { month: 'Aug', revenue: 134200, orders: 3380, profit: 34800 },
];

export const categorySales = [
  { name: 'Signature Wraps', value: 42, revenue: 10450 },
  { name: 'Classic Rolls', value: 35, revenue: 8712 },
  { name: 'Sides', value: 13, revenue: 3240 },
  { name: 'Drinks', value: 10, revenue: 2490 },
];

export const kitchenOrders = [
  { id: 'WR-1001', type: 'dine-in', table: 2, items: [{ name: 'Signature Chicken Wrap', qty: 2, modifiers: ['Extra Cheese'] }, { name: 'Seasoned Fries', qty: 2, modifiers: [] }], status: 'preparing', createdAt: new Date(Date.now() - 8 * 60000).toISOString() },
  { id: 'WR-1002', type: 'takeout', items: [{ name: 'Spicy Beef Wrap', qty: 1, modifiers: ['No Onions', 'Spicy Mayo'] }, { name: 'Fountain Drink', qty: 1, modifiers: [] }], status: 'pending', createdAt: new Date(Date.now() - 3 * 60000).toISOString() },
  { id: 'WR-1003', type: 'dine-in', table: 5, items: [{ name: 'Teriyaki Salmon Roll', qty: 1, modifiers: [] }, { name: 'Fresh Juice', qty: 2, modifiers: [] }], status: 'preparing', createdAt: new Date(Date.now() - 12 * 60000).toISOString() },
  { id: 'WR-1004', type: 'dine-in', table: 10, items: [{ name: 'Veggie Supreme Wrap', qty: 1, modifiers: ['Extra Cheese'] }, { name: 'Classic Chicken Roll', qty: 2, modifiers: [] }, { name: 'Onion Rings', qty: 1, modifiers: [] }], status: 'pending', createdAt: new Date(Date.now() - 1 * 60000).toISOString() },
  { id: 'WR-1005', type: 'delivery', customer: 'Amina H.', items: [{ name: 'BBQ Chicken Wrap', qty: 3, modifiers: ['Bacon'] }], status: 'ready', createdAt: new Date(Date.now() - 18 * 60000).toISOString() },
];