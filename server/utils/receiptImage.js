const MAX_RECEIPT_IMAGE_LENGTH = 7 * 1024 * 1024;
const RECEIPT_IMAGE_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export function normalizeReceiptImage(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > MAX_RECEIPT_IMAGE_LENGTH || !RECEIPT_IMAGE_PATTERN.test(value)) {
    throw new Error('Receipt photo must be a JPEG, PNG, or WebP image smaller than 5 MB after processing.');
  }
  return value;
}
