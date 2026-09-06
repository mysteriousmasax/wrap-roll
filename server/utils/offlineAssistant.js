function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasAny(message, terms) {
  return terms.some((term) => message.includes(term));
}

function formatPrice(value) {
  return `TZS ${Number(value || 0).toLocaleString()}`;
}

function getMenuReply(message, menu) {
  const normalized = normalize(message);
  const vegetarian = hasAny(normalized, ['vegetarian', 'veggie', 'meatless', 'no meat']);
  const category = ['wrap', 'roll', 'pizza', 'burger', 'salad', 'drink', 'coffee', 'side', 'extra', 'combo']
    .find((term) => normalized.includes(term));
  const items = menu.filter((item) => {
    const searchable = normalize(`${item.name} ${item.description || ''} ${item.category || ''}`);
    if (vegetarian && (!/vegetable|veggie|mushroom|cheese|salad/.test(searchable) || /chicken|beef|steak|tuna|pastrami|meat/.test(searchable))) return false;
    if (category && !searchable.includes(category)) return false;
    return true;
  }).slice(0, 8);
  if (!items.length) return null;
  const label = vegetarian ? 'Vegetarian-labelled options' : category ? `${category[0].toUpperCase()}${category.slice(1)} options` : 'Some menu options';
  return `${label}: ${items.map((item) => `${item.name} (${formatPrice(item.price)})`).join(', ')}.`;
}

function getLearnedStaffReply(message, db) {
  const rows = db.prepare(`SELECT customer.message AS customer_message, staff.message AS staff_message
    FROM chat_messages staff
    INNER JOIN chat_messages customer ON customer.conversation_id = staff.conversation_id
      AND customer.sender_type = 'customer'
      AND customer.id = (SELECT MAX(previous.id) FROM chat_messages previous WHERE previous.conversation_id = staff.conversation_id AND previous.sender_type = 'customer' AND previous.id < staff.id)
    WHERE staff.sender_type = 'staff' AND staff.staff_id IS NOT NULL
    ORDER BY staff.id DESC LIMIT 100`).all();
  const words = new Set(normalize(message).split(' ').filter((word) => word.length > 2));
  let best = null;
  for (const row of rows) {
    const candidateWords = normalize(row.customer_message).split(' ').filter((word) => word.length > 2);
    const score = candidateWords.reduce((total, word) => total + (words.has(word) ? 1 : 0), 0);
    if (score >= 2 && (!best || score > best.score)) best = { score, text: row.staff_message };
  }
  return best?.text || null;
}

export function generateOfflineCustomerReply(message, context, db) {
  const normalized = normalize(message);
  if (!normalized) return null;
  const swahili = /\b(naomba|tafadhali|wapi|saa|chakula|bei|oda|imefunguliwa|asante|habari|mna|mnayo)\b/.test(normalized);

  if (hasAny(normalized, ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'])) {
    return swahili ? 'Habari. Tunawezaje kukusaidia kuhusu oda yako ya Wrap & Roll?' : 'Hello. How can we help with your Wrap & Roll order?';
  }
  if (hasAny(normalized, ['hour', 'open', 'closing', 'close'])) {
    return swahili ? `Tunafungua: ${context.openingHours}.` : `Our opening hours are: ${context.openingHours}.`;
  }
  if (hasAny(normalized, ['where', 'location', 'address', 'located', 'direction'])) {
    return swahili ? `Tupo ${context.location}.` : `We are located at ${context.location}.`;
  }
  if (hasAny(normalized, ['deliver', 'delivery', 'delivery area'])) {
    return swahili ? 'Ndiyo, tunapeleka oda. Weka anwani yako wakati wa malipo au tuma eneo lako hapa ili timu ithibitishe.' : 'Yes, we accept delivery orders. Add your delivery address at checkout or share your location in this chat so the team can confirm delivery.';
  }
  if (hasAny(normalized, ['pay', 'payment', 'cash', 'card', 'lipa', 'mpesa', 'mobile money'])) {
    return swahili ? 'Chagua njia ya malipo inayopatikana wakati wa checkout. Kwa tatizo la malipo, tuma namba ya oda ili staff akusaidie.' : 'You can choose an available payment method at checkout. For payment problems, please share your order number and a staff member will assist.';
  }
  if (context.orderStatus && /\bwr\s*[- ]?\d+\b/.test(normalized)) {
    if (typeof context.orderStatus === 'object') {
      return `Order ${context.orderStatus.id} is currently ${context.orderStatus.status}. Payment status: ${context.orderStatus.paymentStatus || 'not recorded'}.`;
    }
    return 'I could not verify that order with the contact details provided. Please check the order number and customer phone or email.';
  }
  if (hasAny(normalized, ['menu', 'food', 'dish', 'meal', 'vegetarian', 'veggie', 'price', 'cost', 'available', 'what do you sell']) && context.menu?.length) {
    return getMenuReply(message, context.menu) || 'Please browse the current menu on this website, or a staff member can help you choose.';
  }

  const learnedReply = getLearnedStaffReply(message, db);
  if (learnedReply) return learnedReply;
  return null;
}
