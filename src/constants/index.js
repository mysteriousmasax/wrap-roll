export const ORDER_TYPES = ['dine-in', 'takeout', 'delivery'];

export const PAYMENT_METHODS = [
  { id: 'card', label: 'Credit / Debit Card', icon: 'credit-card' },
  { id: 'mobile', label: 'Mobile Money (Lipa Namba)', icon: 'smartphone' },
  { id: 'cash', label: 'Cash', icon: 'banknote' },
];

export const CATEGORIES = [
  { id: 'wraps', label: 'Wraps', icon: 'lunch_dining' },
  { id: 'rolls', label: 'Rolls', icon: 'restaurant' },
  { id: 'sides', label: 'Sides', icon: 'fastfood' },
  { id: 'drinks', label: 'Drinks', icon: 'local_drink' },
];

export const ORDER_STATUS = {
  PENDING: 'pending',
  PREPARING: 'preparing',
  READY: 'ready',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const TABLE_STATUS = {
  AVAILABLE: 'available',
  OCCUPIED: 'occupied',
  RESERVED: 'reserved',
  CLEANING: 'cleaning',
};

export const USER_ROLES = {
  FOH: 'foh',
  KITCHEN: 'kitchen',
  MANAGER: 'manager',
  EXECUTIVE: 'executive',
  ADMIN: 'admin',
};