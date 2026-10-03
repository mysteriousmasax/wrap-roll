export function buildCampaignSubject(type = 'welcome', restaurantName = 'Wrap & Roll') {
  const subjects = {
    welcome: `Welcome to ${restaurantName}`,
    birthday: `Happy birthday from ${restaurantName}`,
    winback: `We miss you at ${restaurantName}`,
    reservation: `Your reservation at ${restaurantName}`,
    thankyou: `Thanks for dining with ${restaurantName}`,
    loyalty: `Your rewards are ready at ${restaurantName}`,
    newsletter: `${restaurantName} this week`,
    offer: `A special offer from ${restaurantName}`,
  };

  return subjects[type] || `${restaurantName} update`;
}

export const campaignTypes = [
  'welcome', 'reservation', 'thankyou', 'receipt', 'birthday', 'winback', 'loyalty',
  'newsletter', 'new_menu', 'holiday', 'event', 'offer', 'review_request',
];

export function buildCampaignBody(type = 'welcome', options = {}) {
  const {
    firstName = 'friend',
    restaurantName = 'Wrap & Roll',
    offer = '15% off your next order',
    eventName = 'this week',
    reservationDate = 'your next visit',
  } = options;

  const bodies = {
    welcome: `Hi ${firstName},\n\nWelcome to ${restaurantName}. We are delighted to serve you the bold flavours, fresh wraps, and warm hospitality you deserve.\n\nTo say thank you, enjoy ${offer} on your next order.\n\nWe can’t wait to welcome you back soon.`,
    birthday: `Hi ${firstName},\n\nHappy birthday from ${restaurantName}! Thank you for choosing us for your celebrations and everyday meals.\n\nWe have a special birthday treat ready for you: ${offer}.\n\nEnjoy your day and we hope to celebrate with you again soon.`,
    winback: `Hi ${firstName},\n\nIt’s been a while since we last served you at ${restaurantName}, and we would love to welcome you back.\n\nCome back and enjoy ${offer} on your next visit.\n\nWe’ve missed you and would be happy to serve you again.`,
    reservation: `Hi ${firstName},\n\nThis is a quick reminder for your reservation at ${restaurantName} on ${reservationDate}.\n\nWe look forward to hosting you soon. If you need to update your booking, just reply to this email and our team will help.`,
    thankyou: `Hi ${firstName},\n\nThank you for visiting ${restaurantName}. We hope you enjoyed your meal and the experience from start to finish.\n\nWe would love to hear from you and invite you back for ${offer} on your next visit.`,
    loyalty: `Hi ${firstName},\n\nYour loyalty rewards are ready at ${restaurantName}.\n\nUse this offer to enjoy ${offer} the next time you visit.\n\nThank you for being part of our restaurant family.`,
    newsletter: `Hi ${firstName},\n\nHere is what’s happening at ${restaurantName} ${eventName}.\n\nWe’re sharing new menu highlights, seasonal offers, and updates from the kitchen.\n\nEnjoy ${offer} and stop by soon.`,
    offer: `Hi ${firstName},\n\nWe’ve prepared a special offer just for you at ${restaurantName}.\n\n${offer}\n\nWe hope to see you soon for another great meal.`,
  };

  const message = bodies[type] || bodies.offer;
  return `${message}\n\nUnsubscribe anytime from your email preferences. We respect your inbox and only send relevant updates from ${restaurantName}.`;
}

export function selectAudience(subscribers = [], segment = 'all', channel = 'email', suppressions = new Set()) {
  const resolvedSegment = String(segment || 'all').toLowerCase();
  const resolvedChannel = String(channel || 'email').toLowerCase();
  const suppressedEmails = suppressions instanceof Set
    ? suppressions
    : new Set((suppressions || []).map((email) => String(email).trim().toLowerCase()));

  return subscribers.filter((subscriber) => {
    if (!subscriber || subscriber.active === 0 || subscriber.active === false) return false;
    const consent = String(subscriber.consent_status || subscriber.consentStatus || '').toLowerCase();
    if (consent !== 'subscribed') return false;
    if (subscriber.verified === 0 || subscriber.verified === false) return false;
    const email = String(subscriber.email || '').trim().toLowerCase();
    if (!email || suppressedEmails.has(email)) return false;
    const preferredChannel = String(subscriber.preferred_channel || subscriber.preferredChannel || subscriber.channel || 'email').toLowerCase();
    if (resolvedChannel !== 'all' && preferredChannel !== resolvedChannel) return false;
    if (resolvedSegment !== 'all' && String(subscriber.segment || 'regular').toLowerCase() !== resolvedSegment) return false;
    return true;
  });
}

export function renderEmailTemplate(value = '', variables = {}) {
  const values = {
    first_name: variables.firstName || 'friend',
    last_name: variables.lastName || '',
    email: variables.email || '',
    restaurant_name: variables.restaurantName || 'Wrap & Roll',
    offer: variables.offer || '',
    order_id: variables.orderId || '',
    unsubscribe_url: variables.unsubscribeUrl || '',
    review_url: variables.reviewUrl || '',
    reservation_date: variables.reservationDate || '',
  };
  return String(value || '').replace(/{{\s*([a-z_]+)\s*}}/gi, (match, key) => (
    Object.hasOwn(values, key.toLowerCase()) ? String(values[key.toLowerCase()]) : match
  ));
}

export function escapeEmailHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

export function plainTextToHtml(value = '') {
  const lines = String(value).split(/\r?\n/).map((line) => escapeEmailHtml(line));
  return `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#24211e">${lines.map((line) => line || '&nbsp;').join('<br>')}</div>`;
}
