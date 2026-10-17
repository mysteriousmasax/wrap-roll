function normalizePhoneKey(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : '';
}

export function createCustomerOrderMatcher(customers) {
  const customersById = new Map(customers.map((customer) => [Number(customer.id), customer]));
  const phoneMatches = new Map();
  const emailMatches = new Map();
  const nameMatches = new Map();

  const addMatch = (matches, key, customer) => {
    if (!key) return;
    const ids = matches.get(key) || new Set();
    ids.add(Number(customer.id));
    matches.set(key, ids);
  };

  for (const customer of customers) {
    addMatch(phoneMatches, normalizePhoneKey(customer.phone), customer);
    addMatch(emailMatches, String(customer.email || '').trim().toLowerCase(), customer);
    addMatch(nameMatches, String(customer.name || '').trim().toLowerCase(), customer);
  }

  return (order) => {
    if (order.customer_id != null) return customersById.get(Number(order.customer_id)) || null;

    const phone = phoneMatches.get(normalizePhoneKey(order.customer_phone));
    const emailKey = String(order.customer_email || '').trim().toLowerCase();
    const email = emailMatches.get(emailKey);
    if (phone && email) {
      const sharedIds = [...phone].filter((id) => email.has(id));
      return sharedIds.length === 1 ? customersById.get(sharedIds[0]) : null;
    }
    const contactIds = phone || email;
    if (contactIds) return contactIds.size === 1 ? customersById.get([...contactIds][0]) : null;

    const nameKey = String(order.customer_name || '').trim().toLowerCase();
    const names = nameMatches.get(nameKey);
    return names?.size === 1 ? customersById.get([...names][0]) : null;
  };
}