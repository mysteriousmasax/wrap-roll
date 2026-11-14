export function estimateOfferDiscount(offer, items) {
  if (!offer) return 0;
  const eligible = new Set((offer.eligibleMenuItemIds || []).map(Number));
  const rows = items.filter((item) => !eligible.size || eligible.has(Number(item.variantMenuItemId || item.id)));
  const subtotal = rows.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  if (subtotal < Number(offer.minimumSubtotal || 0)) return 0;
  if (offer.discountType === 'percentage') return Math.min(subtotal, subtotal * Number(offer.discountValue || 0) / 100);
  if (offer.discountType === 'fixed') return Math.min(subtotal, Number(offer.discountValue || 0));
  if (offer.discountType === 'buy_x_get_y') {
    const units = rows.slice().sort((left, right) => Number(left.price) - Number(right.price));
    const groupSize = Number(offer.qualifyingQuantity) + Number(offer.rewardQuantity);
    if (!Number.isInteger(groupSize) || groupSize <= 0) return 0;
    let reward = Math.floor(rows.reduce((sum, item) => sum + Number(item.quantity || 0), 0) / groupSize) * Number(offer.rewardQuantity);
    let discount = 0;
    for (const item of units) {
      const count = Math.min(reward, Number(item.quantity || 0));
      discount += count * Number(item.price || 0);
      reward -= count;
      if (!reward) break;
    }
    return discount;
  }
  return 0;
}
