export function calculateOfferDiscount(offer, items, subtotal) {
  const eligibleIds = (() => {
    try {
      const ids = JSON.parse(offer.eligible_menu_item_ids || '[]');
      return Array.isArray(ids) ? new Set(ids.map(Number)) : new Set();
    } catch {
      return new Set();
    }
  })();
  const eligibleItems = items.filter((item) => !eligibleIds.size || eligibleIds.has(Number(item.menuItemId)));
  const eligibleSubtotal = eligibleItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  if (Number(subtotal) < Number(offer.minimum_subtotal || 0) || eligibleSubtotal <= 0) {
    throw new Error('This offer is not eligible for the current order.');
  }

  if (offer.discount_type === 'percentage') {
    return Math.min(eligibleSubtotal, eligibleSubtotal * Number(offer.discount_value) / 100);
  }
  if (offer.discount_type === 'fixed') {
    return Math.min(eligibleSubtotal, Number(offer.discount_value));
  }
  if (offer.discount_type === 'buy_x_get_y') {
    const qualifyingQuantity = Number(offer.qualifying_quantity);
    const rewardQuantity = Number(offer.reward_quantity);
    if (!Number.isInteger(qualifyingQuantity) || qualifyingQuantity < 1
      || !Number.isInteger(rewardQuantity) || rewardQuantity < 1) {
      throw new Error('This offer has invalid buy/get quantities.');
    }
    const units = eligibleItems.slice().sort((a, b) => a.price - b.price);
    const groupSize = qualifyingQuantity + rewardQuantity;
    let rewardUnits = Math.floor(eligibleItems.reduce((sum, item) => sum + item.qty, 0) / groupSize) * rewardQuantity;
    let discount = 0;
    for (const item of units) {
      const discountedQuantity = Math.min(rewardUnits, item.qty);
      discount += discountedQuantity * item.price;
      rewardUnits -= discountedQuantity;
      if (!rewardUnits) break;
    }
    return discount;
  }
  throw new Error('This offer uses an unsupported discount type.');
}

export function validateOfferAvailability(offer, now = new Date()) {
  if (!offer || !offer.active) throw new Error('This offer is not available.');
  const instant = now.getTime();
  if (offer.starts_at && new Date(offer.starts_at).getTime() > instant) throw new Error('This offer has not started yet.');
  if (offer.ends_at && new Date(offer.ends_at).getTime() < instant) throw new Error('This offer has expired.');
  if (offer.max_uses != null && Number(offer.use_count) >= Number(offer.max_uses)) throw new Error('This offer has reached its usage limit.');
}
