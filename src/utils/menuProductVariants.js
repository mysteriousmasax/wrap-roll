const VARIANT_LABELS = ['small', 'medium', 'large', 'half', 'full', 'single', 'double', 'hot', 'cold', 'solo', 'combo'];
const VARIANT_LABEL_SET = new Set(VARIANT_LABELS);
const VARIANT_ORDER = new Map(VARIANT_LABELS.map((label, index) => [label, index]));
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const variantSuffix = new RegExp(`(?:\\s*\\(\\s*|\\s*[-–—]\\s*|\\s+)(${VARIANT_LABELS.map(escapePattern).join('|')})\\s*\\)?\\s*$`, 'i');

export function isMenuVariantCategory(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z]+/g, '');
  return VARIANT_LABEL_SET.has(normalized);
}

function getLegacyVariant(item) {
  const name = String(item.name || '').trim();
  const suffix = name.match(variantSuffix);
  const categoryVariant = (item.categories || [item.category]).find(isMenuVariantCategory);
  const label = String(suffix?.[1] || categoryVariant || '').trim().toLowerCase();
  if (!VARIANT_LABEL_SET.has(label)) return null;

  const baseName = suffix ? name.slice(0, suffix.index).trim() : name;
  const key = baseName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return key ? { key, label: `${label[0].toUpperCase()}${label.slice(1)}`, baseName } : null;
}

export function groupLegacyMenuVariants(items) {
  const groups = new Map();
  items.forEach((item, index) => {
    if (item.variants?.length) return;
    const variant = getLegacyVariant(item);
    if (!variant) return;
    const group = groups.get(variant.key) || [];
    group.push({ item, index, ...variant });
    groups.set(variant.key, group);
  });

  const groupedAtIndex = new Map();
  const hiddenIds = new Set();
  groups.forEach((entries) => {
    const labels = entries.map((entry) => entry.label.toLowerCase());
    if (entries.length < 2 || new Set(labels).size !== entries.length) return;

    const first = entries[0];
    const variants = entries
      .map((entry) => ({
        name: entry.label,
        price: Number(entry.item.price),
        menuItemId: entry.item.id,
      }))
      .sort((left, right) => VARIANT_ORDER.get(left.name.toLowerCase()) - VARIANT_ORDER.get(right.name.toLowerCase()));
    const categories = [...new Set(entries.flatMap(({ item }) => item.categories || [item.category]).filter((category) => category && !isMenuVariantCategory(category)))];

    groupedAtIndex.set(first.index, {
      ...first.item,
      name: first.baseName,
      category: categories[0] || first.item.category,
      categories: categories.length ? categories : [first.item.category].filter(Boolean),
      price: Math.min(...variants.map((variant) => variant.price)),
      variants,
    });
    entries.slice(1).forEach(({ item }) => hiddenIds.add(item.id));
  });

  return items.flatMap((item, index) => {
    if (hiddenIds.has(item.id)) return [];
    return [groupedAtIndex.get(index) || item];
  });
}