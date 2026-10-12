import { createHash } from 'node:crypto';

export const fallbackMenuImage = 'https://wrapandrolltz.com/uploads/photo_gallery/d706fc0ef56440dd131465fd75aae870.jpg';
const maxPublicEmbeddedImageLength = 2 * 1024 * 1024;
const maxEmbeddedImageBytes = 8 * 1024 * 1024;

export function getMenuImage(image, itemId, isPublic = false) {
  if (typeof image !== 'string') return fallbackMenuImage;
  const value = image.trim();
  if (isPublic && value.startsWith('data:image/') && value.length > maxPublicEmbeddedImageLength) return fallbackMenuImage;
  const embeddedImage = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([a-z\d+/=]+)$/i.exec(value);
  if (embeddedImage) {
    if (Buffer.byteLength(embeddedImage[2], 'base64') > maxEmbeddedImageBytes) return fallbackMenuImage;
    const imageHash = createHash('sha256').update(value).digest('hex').slice(0, 20);
    return `/api/menu/image/${Number(itemId)}/${imageHash}`;
  }
  if (/^(https?:\/\/|\/)/i.test(value)) return value;
  return fallbackMenuImage;
}

export function decodeMenuImage(value) {
  if (typeof value !== 'string') return null;
  const embeddedImage = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([a-z\d+/=]+)$/i.exec(value.trim());
  if (!embeddedImage) return null;
  const data = Buffer.from(embeddedImage[2], 'base64');
  if (!data.length || data.length > maxEmbeddedImageBytes) return null;
  return { contentType: embeddedImage[1].toLowerCase(), data };
}

export function getMenuImageHash(value) {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';
  return createHash('sha256').update(normalizedValue).digest('hex').slice(0, 20);
}