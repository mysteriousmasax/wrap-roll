function parseDate(line) {
  const iso = line.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  const local = line.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (local) return `${local[3]}-${String(local[2]).padStart(2, '0')}-${String(local[1]).padStart(2, '0')}`;
  return '';
}

function parseAmount(value) {
  const normalized = String(value || '').replace(/,/g, '').trim();
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : '';
}

export function parseReceiptText(source) {
  const lines = String(source || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const dateLine = lines.find((line) => parseDate(line));
  const referenceLine = lines.find((line) => /\b(receipt|invoice|reference|ref|transaction|trans\.?\s*id)\b/i.test(line));
  const reference = referenceLine?.match(/\b(?:receipt|invoice|reference|ref|transaction|trans\.?\s*id)\b\s*(?:no\.?\s*)?[:#-]?\s*([A-Z0-9][A-Z0-9/-]{2,})/i)?.[1] || '';
  const totalLines = lines.filter((line) => /\b(grand\s+total|amount\s+due|total\s+due|net\s+total|total|amount\s+paid)\b/i.test(line));
  const totalLine = totalLines.at(-1) || '';
  const amountMatches = totalLine.match(/\d[\d,]*(?:\.\d{1,2})?/g) || [];
  const amount = parseAmount(amountMatches.at(-1));
  const ignoredLine = (line) => line === dateLine || line === referenceLine || /\b(grand\s+total|amount\s+due|total\s+due|net\s+total|total|amount\s+paid)\b/i.test(line);
  const supplier = lines.find((line) => !ignoredLine(line) && !/^\d/.test(line)) || '';
  const description = lines.filter((line) => line !== supplier && !ignoredLine(line)).join(' · ').slice(0, 500);

  return {
    supplier,
    expenseDate: dateLine ? parseDate(dateLine) : '',
    receiptRef: reference,
    amount,
    description,
    rawText: String(source || ''),
  };
}