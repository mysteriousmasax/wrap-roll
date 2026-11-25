export function createReceiptStockLine(item, matchedItem, emptyLine) {
  return {
    ...emptyLine,
    ...item,
    inventoryId: matchedItem ? String(matchedItem.id) : '',
    sku: matchedItem?.sku || '',
    unit: item.unit || matchedItem?.purchaseUnit || matchedItem?.unit,
    threshold: matchedItem ? String(matchedItem.threshold ?? 0) : '',
    quantity: String(item.quantity),
    unitCost: String(item.unitCost),
  };
}
