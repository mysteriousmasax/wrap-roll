export function normalizeMenuVariants(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('Variants must be a list');

  const seenNames = new Set();
  return value.map((variant) => {
    const name = String(variant?.name || '').trim();
    const price = Number(variant?.price);
    const normalizedName = name.toLowerCase();
    if (!name || !Number.isFinite(price) || price <= 0) {
      throw new Error('Each variant needs a name and a price greater than zero');
    }
    if (seenNames.has(normalizedName)) throw new Error('Variant names must be unique');
    seenNames.add(normalizedName);
    return { name, price };
  });
}

export function parseMenuVariants(value) {
  if (Array.isArray(value)) return normalizeMenuVariants(value);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    return normalizeMenuVariants(JSON.parse(value));
  } catch {
    return [];
  }
}