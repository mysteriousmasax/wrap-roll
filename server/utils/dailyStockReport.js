function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeDailyStockRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => {
    const item = String(row?.item ?? '').trim() || `Stock item ${index + 1}`;
    const unit = String(row?.unit ?? 'units').trim() || 'units';
    const opening = Number(row?.opening ?? 0);
    const added = Number(row?.added ?? 0);
    const closing = Number(row?.closing ?? 0);
    const status = ['ok', 'prep', 'restock', 'low'].includes(String(row?.status || 'ok')) ? String(row.status || 'ok') : 'ok';
    return {
      item,
      unit,
      opening: Number.isFinite(opening) ? opening : 0,
      added: Number.isFinite(added) ? added : 0,
      closing: Number.isFinite(closing) ? closing : 0,
      status,
      variance: Number.isFinite(closing - opening) ? closing - opening : 0,
    };
  });
}

export function calculateDailyStockSummary(rows = [], options = {}) {
  const normalizedRows = normalizeDailyStockRows(rows);
  const inventoryByName = new Map((Array.isArray(options.inventory) ? options.inventory : []).map((item) => [normalizeName(item.name), { unitCost: Number(item.unit_cost || item.unitCost || 0) }]));
  const fallbackUnitCost = Number(options.defaultUnitCost || options.unitCost || 1200);

  let totalOpeningStock = 0;
  let totalAdded = 0;
  let totalClosingStock = 0;
  let totalInventoryValue = 0;
  let totalVariance = 0;
  const lowStockItems = [];

  for (const row of normalizedRows) {
    totalOpeningStock += row.opening;
    totalAdded += row.added;
    totalClosingStock += row.closing;
    totalVariance += row.variance;

    const cost = inventoryByName.get(normalizeName(row.item))?.unitCost || fallbackUnitCost;
    const closingValue = row.closing * cost;
    totalInventoryValue += closingValue;

    if (row.status === 'restock' || row.status === 'prep' || row.status === 'low' || row.closing <= 0) {
      lowStockItems.push({ item: row.item, unit: row.unit, closing: row.closing, status: row.status });
    }
  }

  return {
    rows: normalizedRows,
    totalItems: normalizedRows.length,
    totalOpeningStock,
    totalAdded,
    totalClosingStock,
    stockVariance: totalVariance,
    lowStockItems,
    financialSummary: {
      totalValue: Number(totalInventoryValue.toFixed(2)),
      lowStockCount: lowStockItems.length,
      openingStock: totalOpeningStock,
      closingStock: totalClosingStock,
      stockVariance: totalVariance,
      currency: options.currency || 'TZS',
    },
  };
}
