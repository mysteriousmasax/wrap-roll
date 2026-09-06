import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function InternalQrCode({ number, uploadedImage = '', useInternal = true, alt = 'Lipa Namba QR code', className = '' }) {
  const [generatedImage, setGeneratedImage] = useState('');

  useEffect(() => {
    let active = true;
    if (!number || !useInternal) {
      setGeneratedImage('');
      return () => { active = false; };
    }

    QRCode.toDataURL(`Lipa Namba: ${number}`, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 320,
      color: { dark: '#1f1d1b', light: '#ffffff' },
    }).then((image) => {
      if (active) setGeneratedImage(image);
    }).catch(() => {
      if (active) setGeneratedImage('');
    });

    return () => { active = false; };
  }, [number, useInternal]);

  const image = useInternal ? generatedImage || uploadedImage : uploadedImage;
  if (!image) return null;
  return <img src={image} alt={alt} className={className} />;
}
