const unitDefinitions = new Map([
  ['g', { dimension: 'mass', factor: 1 }],
  ['gram', { dimension: 'mass', factor: 1 }],
  ['grams', { dimension: 'mass', factor: 1 }],
  ['kg', { dimension: 'mass', factor: 1000 }],
  ['kilogram', { dimension: 'mass', factor: 1000 }],
  ['kilograms', { dimension: 'mass', factor: 1000 }],
  ['mg', { dimension: 'mass', factor: 0.001 }],
  ['milligram', { dimension: 'mass', factor: 0.001 }],
  ['milligrams', { dimension: 'mass', factor: 0.001 }],
  ['ml', { dimension: 'volume', factor: 1 }],
  ['millilitre', { dimension: 'volume', factor: 1 }],
  ['millilitres', { dimension: 'volume', factor: 1 }],
  ['milliliter', { dimension: 'volume', factor: 1 }],
  ['milliliters', { dimension: 'volume', factor: 1 }],
  ['l', { dimension: 'volume', factor: 1000 }],
  ['litre', { dimension: 'volume', factor: 1000 }],
  ['litres', { dimension: 'volume', factor: 1000 }],
  ['liter', { dimension: 'volume', factor: 1000 }],
  ['liters', { dimension: 'volume', factor: 1000 }],
  ['pcs', { dimension: 'count', factor: 1 }],
  ['pc', { dimension: 'count', factor: 1 }],
  ['piece', { dimension: 'count', factor: 1 }],
  ['pieces', { dimension: 'count', factor: 1 }],
  ['unit', { dimension: 'count', factor: 1 }],
  ['units', { dimension: 'count', factor: 1 }],
  ['each', { dimension: 'count', factor: 1 }],
  ['ea', { dimension: 'count', factor: 1 }],
]);

function normalizeUnit(unit) {
  return String(unit || '').trim().toLowerCase();
}

export function getStockUnitConversionFactor(fromUnit, toUnit) {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (!from || !to) return null;
  if (from === to) return 1;

  const fromDefinition = unitDefinitions.get(from);
  const toDefinition = unitDefinitions.get(to);
  if (fromDefinition && toDefinition && fromDefinition.dimension === toDefinition.dimension) {
    return fromDefinition.factor / toDefinition.factor;
  }
  return null;
}

export function convertStockQuantity(quantity, fromUnit, toUnit) {
  const factor = getStockUnitConversionFactor(fromUnit, toUnit);
  if (factor === null) return null;
  return Number(quantity) * factor;
}
