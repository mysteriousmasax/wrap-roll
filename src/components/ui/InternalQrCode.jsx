import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function InternalQrCode({
  number,
  value,
  uploadedImage = '',
  useInternal = true,
  alt = 'Lipa Namba QR code',
  className = '',
}) {
  const [generatedImage, setGeneratedImage] = useState('');
  const qrTarget = String(value || number || '').trim();

  useEffect(() => {
    let active = true;
    if (!qrTarget || !useInternal) {
      setGeneratedImage('');
      return () => { active = false; };
    }

    // Encode the actual number/payload directly so phones and banking apps detect it accurately
    QRCode.toDataURL(qrTarget, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 360,
      color: { dark: '#1f1d1b', light: '#ffffff' },
    }).then((image) => {
      if (active) setGeneratedImage(image);
    }).catch(() => {
      if (active) setGeneratedImage('');
    });

    return () => { active = false; };
  }, [qrTarget, useInternal]);

  // If uploadedImage is just the decorative placeholder logo, prefer the real generated QR code
  const isPlaceholderLogo = uploadedImage === '/lipa-namba-qr-logo.png' || uploadedImage.includes('lipa-namba-qr-logo');
  const image = useInternal
    ? (generatedImage || (!isPlaceholderLogo ? uploadedImage : ''))
    : uploadedImage;

  if (!image) return null;

  return (
    <img
      src={image}
      alt={alt}
      className={className || 'aspect-square w-44 h-44 mx-auto rounded-xl object-contain'}
      style={{ aspectRatio: '1 / 1' }}
    />
  );
}
