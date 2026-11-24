const unitDefinitions = new Map([
  ['mg', { dimension: 'mass', factor: 0.001 }],
  ['milligram', { dimension: 'mass', factor: 0.001 }],
  ['milligrams', { dimension: 'mass', factor: 0.001 }],
  ['g', { dimension: 'mass', factor: 1 }],
  ['gram', { dimension: 'mass', factor: 1 }],
  ['grams', { dimension: 'mass', factor: 1 }],
  ['kg', { dimension: 'mass', factor: 1000 }],
  ['kilogram', { dimension: 'mass', factor: 1000 }],
  ['kilograms', { dimension: 'mass', factor: 1000 }],
  ['oz', { dimension: 'mass', factor: 28.349523125 }],
  ['ounce', { dimension: 'mass', factor: 28.349523125 }],
  ['ounces', { dimension: 'mass', factor: 28.349523125 }],
  ['lb', { dimension: 'mass', factor: 453.59237 }],
  ['lbs', { dimension: 'mass', factor: 453.59237 }],
  ['pound', { dimension: 'mass', factor: 453.59237 }],
  ['pounds', { dimension: 'mass', factor: 453.59237 }],
  ['tonne', { dimension: 'mass', factor: 1_000_000 }],
  ['tonnes', { dimension: 'mass', factor: 1_000_000 }],
  ['metric ton', { dimension: 'mass', factor: 1_000_000 }],
  ['ml', { dimension: 'volume', factor: 1 }],
  ['millilitre', { dimension: 'volume', factor: 1 }],
  ['millilitres', { dimension: 'volume', factor: 1 }],
  ['milliliter', { dimension: 'volume', factor: 1 }],
  ['milliliters', { dimension: 'volume', factor: 1 }],
  ['cl', { dimension: 'volume', factor: 10 }],
  ['centilitre', { dimension: 'volume', factor: 10 }],
  ['centilitres', { dimension: 'volume', factor: 10 }],
  ['l', { dimension: 'volume', factor: 1000 }],
  ['litre', { dimension: 'volume', factor: 1000 }],
  ['litres', { dimension: 'volume', factor: 1000 }],
  ['liter', { dimension: 'volume', factor: 1000 }],
  ['liters', { dimension: 'volume', factor: 1000 }],
  ['tsp', { dimension: 'volume', factor: 5 }],
  ['teaspoon', { dimension: 'volume', factor: 5 }],
  ['teaspoons', { dimension: 'volume', factor: 5 }],
  ['tbsp', { dimension: 'volume', factor: 15 }],
  ['tablespoon', { dimension: 'volume', factor: 15 }],
  ['tablespoons', { dimension: 'volume', factor: 15 }],
  ['cup', { dimension: 'volume', factor: 250 }],
  ['cups', { dimension: 'volume', factor: 250 }],
  ['us fl oz', { dimension: 'volume', factor: 29.5735295625 }],
  ['us gallon', { dimension: 'volume', factor: 3785.411784 }],
  ['us gallons', { dimension: 'volume', factor: 3785.411784 }],
  ['pcs', { dimension: 'count', factor: 1 }],
  ['pc', { dimension: 'count', factor: 1 }],
  ['piece', { dimension: 'count', factor: 1 }],
  ['pieces', { dimension: 'count', factor: 1 }],
  ['pieces (full)', { dimension: 'count', factor: 1 }],
  ['pieces (half)', { dimension: 'count', factor: 0.5 }],
  ['unit', { dimension: 'count', factor: 1 }],
  ['units', { dimension: 'count', factor: 1 }],
  ['each', { dimension: 'count', factor: 1 }],
  ['ea', { dimension: 'count', factor: 1 }],
  ['loaf', { dimension: 'count:loaf', factor: 1 }],
  ['loaves', { dimension: 'count:loaf', factor: 1 }],
  ['slice', { dimension: 'count:slice', factor: 1 }],
  ['slices', { dimension: 'count:slice', factor: 1 }],
  ['card', { dimension: 'count:card', factor: 1 }],
  ['cards', { dimension: 'count:card', factor: 1 }],
  ['bottle', { dimension: 'count:bottle', factor: 1 }],
  ['bottles', { dimension: 'count:bottle', factor: 1 }],
  ['can', { dimension: 'count:can', factor: 1 }],
  ['cans', { dimension: 'count:can', factor: 1 }],
  ['box', { dimension: 'count:box', factor: 1 }],
  ['boxes', { dimension: 'count:box', factor: 1 }],
  ['pack', { dimension: 'count:pack', factor: 1 }],
  ['packs', { dimension: 'count:pack', factor: 1 }],
  ['bag', { dimension: 'count:bag', factor: 1 }],
  ['bags', { dimension: 'count:bag', factor: 1 }],
  ['case', { dimension: 'count:case', factor: 1 }],
  ['cases', { dimension: 'count:case', factor: 1 }],
  ['carton', { dimension: 'count:carton', factor: 1 }],
  ['cartons', { dimension: 'count:carton', factor: 1 }],
  ['crate', { dimension: 'count:crate', factor: 1 }],
  ['crates', { dimension: 'count:crate', factor: 1 }],
  ['roll', { dimension: 'count:roll', factor: 1 }],
  ['rolls', { dimension: 'count:roll', factor: 1 }],
  ['tray', { dimension: 'count:tray', factor: 1 }],
  ['trays', { dimension: 'count:tray', factor: 1 }],
  ['portion', { dimension: 'count:portion', factor: 1 }],
  ['portions', { dimension: 'count:portion', factor: 1 }],
  ['dozen', { dimension: 'count', factor: 12 }],
  ['dozens', { dimension: 'count', factor: 12 }],
]);

export const stockUnitGroups = [
  { label: 'Weight', units: ['mg', 'g', 'kg', 'oz', 'lb', 'tonne'] },
  { label: 'Volume', units: ['ml', 'cl', 'litre', 'tsp', 'tbsp', 'cup', 'US fl oz', 'US gallon'] },
  { label: 'Count and packaging', units: ['pcs', 'units', 'pieces (half)', 'pieces (full)', 'loaves', 'slices', 'cards', 'bottle', 'can', 'box', 'pack', 'bag', 'case', 'carton', 'crate', 'roll', 'tray', 'portion', 'dozen'] },
];

export const stockUnitOptions = stockUnitGroups.flatMap((group) => group.units);

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
