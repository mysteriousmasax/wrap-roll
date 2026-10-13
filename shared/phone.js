export function normalizeTanzanianPhone(value) {
  const phone = String(value ?? '').trim();
  const digits = phone.replace(/\D/g, '');

  if (/^0[67]\d{8}$/.test(digits)) return `+255${digits.slice(1)}`;
  if (/^255[67]\d{8}$/.test(digits)) return `+${digits}`;
  return phone;
}