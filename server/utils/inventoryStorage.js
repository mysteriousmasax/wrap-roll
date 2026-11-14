export const inventoryStorageColumns = [
  'front_sandwich',
  'front_pizza',
  'front_burger',
  'refrigerator',
  'back_freezer_chiller',
];

export function getStorageAfterConsumption(item, consumedQuantity, nextQuantity) {
  const current = Object.fromEntries(inventoryStorageColumns.map((column) => [column, Math.max(0, Number(item[column] || 0))]));
  const assigned = inventoryStorageColumns.reduce((sum, column) => sum + current[column], 0);
  const remainingAssigned = Math.max(0, Math.min(assigned - Math.max(0, Number(consumedQuantity || 0)), Number(nextQuantity || 0)));
  let remove = assigned - remainingAssigned;

  for (const column of inventoryStorageColumns) {
    const reduction = Math.min(current[column], remove);
    current[column] -= reduction;
    remove -= reduction;
  }
  return current;
}
