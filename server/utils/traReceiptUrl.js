const TRA_RECEIPT_HOST = 'verify.tra.go.tz';
const TRA_RECEIPT_PATH = /^\/[a-z\d]+(?:_[a-z\d]+)?\/?$/i;

export function normalizeTraReceiptUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('Scan a valid TRA receipt verification link.');
  }

  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== TRA_RECEIPT_HOST
    || url.username || url.password || url.port || url.search || url.hash
    || !TRA_RECEIPT_PATH.test(url.pathname)) {
    throw new Error('Only secure receipt links from verify.tra.go.tz are supported.');
  }
  return url.href;
}