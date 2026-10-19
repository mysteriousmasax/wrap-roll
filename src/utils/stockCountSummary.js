const countFields = ['opening', 'added', 'closing'];

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));
}

export function summarizeStockCounts(rows = []) {
  const items = new Map();
  rows.forEach((row) => {
    const name = String(row.item || 'Stock item').trim();
    const key = row.inventoryId != null && row.inventoryId !== ''
      ? `id:${row.inventoryId}`
      : `${name.toLowerCase()}|${String(row.unit || 'units').trim().toLowerCase()}`;
    const item = items.get(key) || { counted: false, needsAttention: false };
    const counts = [row, ...(Array.isArray(row.staffCounts) ? row.staffCounts : [])];
    item.counted ||= counts.some((count) => countFields.some((field) => hasValue(count[field])));
    item.needsAttention ||= counts.some((count) => (
      ['restock', 'prep', 'low'].includes(String(count.status || '').toLowerCase())
      || (hasValue(count.closing) && Number(count.closing) <= 0)
    ));
    items.set(key, item);
  });
  const values = [...items.values()];
  return {
    itemsCounted: values.filter((item) => item.counted).length,
    attentionCount: values.filter((item) => item.needsAttention).length,
  };
}