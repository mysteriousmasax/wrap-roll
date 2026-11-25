import { getStockUnitConversionFactor } from './stockUnits.js';

const quantityFields = [
  'quantity',
  'threshold',
  'backFreezerChiller',
  'refrigerator',
  'frontSandwich',
  'frontPizza',
  'frontBurger',
];

export function convertInventoryFormBaseUnit(form, nextUnit) {
  const conversionFactor = getStockUnitConversionFactor(form.unit, nextUnit);
  if (conversionFactor === null) return null;

  const converted = {
    ...form,
    unit: nextUnit,
    reinterpretUnit: false,
    confirmUnitReinterpretation: false,
  };
  for (const field of quantityFields) {
    if (form[field] === '') continue;
    converted[field] = String(Number(form[field] || 0) * conversionFactor);
  }
  converted.purchaseUnitFactor = String(Number(form.purchaseUnitFactor || 1) * conversionFactor);
  converted.unitCost = form.unitCost === '' ? '' : String(Number(form.unitCost || 0) / conversionFactor);
  return converted;
}
