const TRA_RECEIPT_HOST = 'verify.tra.go.tz';
const TRA_RECEIPT_PATH = /^\/[a-z\d]+(?:_[a-z\d]+)?\/?$/i;

export function normalizeTraReceiptUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('Scan a valid TRA receipt verification link.');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.hostname.toLowerCase() !== TRA_RECEIPT_HOST
    || url.username || url.password || url.port) {
    throw new Error('Only receipt links from verify.tra.go.tz are supported.');
  }
  if (url.pathname === '/' || !TRA_RECEIPT_PATH.test(url.pathname)) {
    throw new Error('This is not a complete TRA receipt link. Scan the full receipt QR code, including its receipt code.');
  }
  if (url.search || url.hash) {
    throw new Error('The TRA link contains unsupported query or fragment data. Scan the receipt QR code again.');
  }
  url.protocol = 'https:';
  return url.href;
}

export function resolveTraReceiptRedirect(currentUrl, location) {
  if (!location) throw new Error('TRA returned a redirect without a destination.');
  try {
    return normalizeTraReceiptUrl(new URL(location, currentUrl).href);
  } catch {
    throw new Error('TRA redirected this receipt link outside its supported receipt page.');
  }
}