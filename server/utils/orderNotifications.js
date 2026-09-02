export function buildOrderConfirmationMessage(orderId, channel, customerName) {
  const channelLabel = String(channel || 'WhatsApp').trim();
  const safeName = String(customerName || 'Customer').trim() || 'Customer';
  const intro = `Hi ${safeName}, your order ${orderId} is confirmed.`;

  if (channelLabel.toLowerCase().includes('email')) {
    return `${intro} We have received your order and will keep you updated by Email.`;
  }

  if (channelLabel.toLowerCase().includes('sms') || channelLabel.toLowerCase().includes('text')) {
    return `${intro} We have received your order and will send SMS updates as it progresses.`;
  }

  return `${intro} We have received your order and will send updates on WhatsApp.`;
}

export function getCustomerNotificationChannels(customer) {
  const channels = {
    whatsapp: false,
    sms: false,
    email: false,
    instagram: false,
    facebook: false,
  };

  const preferred = String(customer?.preferred_channel || customer?.channel || '').toLowerCase();
  const email = String(customer?.email || '').trim();
  const phone = String(customer?.phone || '').trim();

  if (preferred.includes('whatsapp')) channels.whatsapp = true;
  if (preferred.includes('sms') || preferred.includes('text')) channels.sms = true;
  if (preferred.includes('email') || email) channels.email = true;
  if (phone) channels.whatsapp = true;

  return channels;
}
