export function withCustomerNameFallback(subscriber, customerName = '') {
  const nameParts = String(customerName || '').trim().split(/\s+/).filter(Boolean);
  return {
    ...subscriber,
    first_name: String(subscriber.first_name || '').trim() || nameParts[0] || '',
    last_name: String(subscriber.last_name || '').trim() || nameParts.slice(1).join(' '),
  };
}

export function getCustomerEmailNames(db) {
  const orderContacts = db.prepare(`SELECT lower(trim(customer_email)) AS email, MAX(customer_name) AS customer_name
    FROM orders WHERE customer_email IS NOT NULL AND trim(customer_email) != ''
    GROUP BY lower(trim(customer_email))`).all();
  const customerContacts = db.prepare(`SELECT lower(trim(email)) AS email, MAX(name) AS customer_name
    FROM customers WHERE email IS NOT NULL AND trim(email) != ''
    GROUP BY lower(trim(email))`).all();
  const namesByEmail = new Map();
  for (const contact of [...orderContacts, ...customerContacts]) {
    if (contact.email && contact.customer_name && !namesByEmail.has(contact.email)) {
      namesByEmail.set(contact.email, contact.customer_name);
    }
  }
  return namesByEmail;
}
