import { parseReceiptText } from './receiptParser.js';

const BLOCK_TAGS = new Set(['ADDRESS', 'ARTICLE', 'BR', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'P', 'SECTION', 'TR']);
const UNIT_NAMES = new Set(['kg', 'g', 'litre', 'l', 'ml', 'pcs', 'pc', 'piece', 'pieces', 'box', 'pack', 'units']);

function nodeText(node) {
  if (node.nodeType === 3) return node.nodeValue || '';
  if (node.nodeType !== 1 || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.tagName)) return '';
  const separator = node.tagName === 'TD' || node.tagName === 'TH' ? ' | ' : BLOCK_TAGS.has(node.tagName) ? '\n' : '';
  const text = [...node.childNodes].map(nodeText).join('');
  return separator ? `${separator}${text}${separator}` : text;
}

function parseNumber(value) {
  const normalized = String(value || '').replace(/[\s,]/g, '').replace(/[^\d.-]/g, '');
  if (!normalized || !/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function receiptItems(document) {
  const items = [];
  document.querySelectorAll('table').forEach((table) => {
    let headers = [];
    table.querySelectorAll('tr').forEach((row) => {
      const cells = [...row.querySelectorAll('th, td')].map((cell) => cell.textContent.trim());
      if (cells.length < 3 || cells.every((cell) => !cell)) return;
      const normalizedHeaders = cells.map((cell) => cell.toLowerCase());
      const nameIndex = normalizedHeaders.findIndex((cell) => /item|description|product/.test(cell));
      const quantityIndex = normalizedHeaders.findIndex((cell) => /qty|quantity/.test(cell));
      const hasHeader = nameIndex >= 0 && quantityIndex >= 0;
      if (hasHeader) {
        headers = normalizedHeaders;
        return;
      }
      if (cells.some((cell) => /^(?:item|description|product|qty|quantity|amount|total|tax)$/i.test(cell))) return;

      const nameColumn = headers.findIndex((cell) => /item|description|product/.test(cell));
      const qtyColumn = headers.findIndex((cell) => /qty|quantity/.test(cell));
      const unitColumn = headers.findIndex((cell) => /^unit$|unit of measure/.test(cell));
      const unitCostColumn = headers.findIndex((cell) => /unit\s*price|price\s*each/.test(cell));
      const totalColumn = headers.findIndex((cell) => /line\s*total|amount|total|value/.test(cell));
      const name = String(cells[nameColumn >= 0 ? nameColumn : 0] || '').trim();
      if (!name || /^(?:total|tax|grand total|sum(?:marized)? sale\b|amount due)/i.test(name)) return;

      const quantityIndexToUse = qtyColumn >= 0 ? qtyColumn : 1;
      const quantity = parseNumber(cells[quantityIndexToUse]);
      const numericCells = cells.map((cell, index) => ({ index, value: parseNumber(cell) })).filter(({ value }) => value != null);
      const lineTotal = totalColumn >= 0
        ? parseNumber(cells[totalColumn])
        : numericCells.filter(({ index }) => index > quantityIndexToUse).at(-1)?.value;
      const unitPrice = unitCostColumn >= 0 ? parseNumber(cells[unitCostColumn]) : null;
      if (!quantity || quantity <= 0 || (lineTotal == null && unitPrice == null)) return;

      let unit = unitColumn >= 0 ? String(cells[unitColumn] || '').trim().toLowerCase() : '';
      const nameUnit = name.match(/\b(kg|g|litre|l|ml|pcs?|pieces?|box|pack|units)\b\s*$/i)?.[1]?.toLowerCase();
      if (!unit && nameUnit) unit = nameUnit;
      if (!UNIT_NAMES.has(unit)) unit = 'pcs';
      const cost = unitPrice ?? lineTotal / quantity;
      items.push({ name: name.replace(/\s+\([^)]*\)$/, ''), quantity, unit, unitCost: Math.round(cost) });
    });
  });
  return items;
}

export function parseTraReceiptHtml(html) {
  if (typeof DOMParser === 'undefined') throw new Error('Receipt page parsing is not supported in this browser.');
  const document = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const rawText = nodeText(document.body).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const parsed = parseReceiptText(rawText);
  const supplierHeading = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
    .map((heading) => heading.textContent.trim())
    .find((text) => text && !/start of legal receipt|end of legal receipt|purchased items|receipt verification|^efd\b|^p\.?\s*o\.?\s*box/i.test(text));
  const items = receiptItems(document);
  const itemDescription = items.map((item) => `${item.quantity} ${item.unit} ${item.name}`).join(', ');
  return {
    ...parsed,
    supplier: supplierHeading || parsed.supplier,
    description: itemDescription || parsed.description,
    items,
    rawText,
  };
}