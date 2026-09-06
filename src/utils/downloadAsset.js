function safeFilename(name, fallback = 'wrap-roll-asset') {
  const cleaned = String(name || fallback).trim().replace(/[^a-z0-9._-]+/gi, '-');
  return cleaned || fallback;
}

function extensionForType(type) {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'application/pdf') return 'pdf';
  return 'jpg';
}

export async function downloadAsset(source, filename = 'wrap-roll-asset') {
  if (!source || typeof source !== 'string') throw new Error('No downloadable asset is available.');

  let blob;
  if (source.startsWith('data:')) {
    const response = await fetch(source);
    blob = await response.blob();
  } else {
    const response = await fetch(source, { mode: 'cors' });
    if (!response.ok) throw new Error('The asset could not be downloaded.');
    blob = await response.blob();
  }

  const baseName = safeFilename(filename);
  const name = /\.[a-z0-9]{2,5}$/i.test(baseName)
    ? baseName
    : `${baseName}.${extensionForType(blob.type)}`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
