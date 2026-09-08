import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// Official Bank of Tanzania (BOT) TIPS EMVCo QR code for PETER JOSEPH MSIRA (Lipa Namba: 45342017)
export const OFFICIAL_TIPS_QR_STRING =
  '00020101021226390014tz.go.bot.tips0105025010208453420175204413153038345802TZ5918PETER JOSEPH MSIRA6005ILALA610512110622103082274534607051100263044ECD';

export const OFFICIAL_TIPS_QR_IMAGE = '/tips-merchant-qr.png';

export default function InternalQrCode({
  number,
  value,
  uploadedImage = '',
  useInternal = true,
  alt = 'Lipa Namba TIPS QR code',
  className = '',
}) {
  const [generatedImage, setGeneratedImage] = useState('');

  // If number is the merchant Lipa Namba 45342017 or empty, use the official Bank of Tanzania TIPS EMVCo payload
  const rawTarget = String(value || number || '').trim();
  const qrTarget =
    rawTarget === '45342017' || !rawTarget
      ? OFFICIAL_TIPS_QR_STRING
      : rawTarget;

  useEffect(() => {
    let active = true;
    if (!qrTarget || !useInternal) {
      setGeneratedImage('');
      return () => { active = false; };
    }

    // Generate standard high-contrast QR code
    QRCode.toDataURL(qrTarget, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 400,
      color: { dark: '#1f1d1b', light: '#ffffff' },
    }).then((image) => {
      if (active) setGeneratedImage(image);
    }).catch(() => {
      if (active) setGeneratedImage('');
    });

    return () => { active = false; };
  }, [qrTarget, useInternal]);

  // Prefer the official high-resolution merchant image for 45342017, otherwise use generated QR
  const isDefaultLipa = rawTarget === '45342017' || !rawTarget;
  const preferredImage = isDefaultLipa
    ? OFFICIAL_TIPS_QR_IMAGE
    : (uploadedImage && uploadedImage !== '/lipa-namba-qr-logo.png' ? uploadedImage : '');

  const image = preferredImage || generatedImage;

  if (!image) return null;

  return (
    <img
      src={image}
      alt={alt}
      className={className || 'aspect-square w-44 h-44 mx-auto rounded-xl object-contain'}
      style={{ aspectRatio: '1 / 1' }}
      loading="eager"
    />
  );
}
