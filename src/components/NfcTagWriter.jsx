import { useState } from 'react';
import { Copy, Radio } from 'lucide-react';
import Button from './ui/Button';

function normalizeHttpUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('Enter a valid website link beginning with https:// or http://.');
  }
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error('NFC links must use https:// or http://.');
  }
  return url.href;
}

export default function NfcTagWriter({ url, label = 'NFC tag' }) {
  const [status, setStatus] = useState('');
  const [writing, setWriting] = useState(false);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(normalizeHttpUrl(url));
      setStatus(`${label} link copied.`);
    } catch (error) {
      setStatus(error.message || 'Could not copy the NFC link. Check clipboard permission.');
    }
  };

  const writeUrl = async () => {
    setStatus('');
    let targetUrl;
    try {
      targetUrl = normalizeHttpUrl(url);
    } catch (error) {
      setStatus(error.message);
      return;
    }
    if (!window.isSecureContext) {
      setStatus('Direct NFC writing requires HTTPS. Open the POS website using its secure https:// address.');
      return;
    }
    if (typeof window.NDEFReader !== 'function') {
      setStatus('This browser does not support Web NFC. Use NFC-enabled Android Chrome, or copy the link and write it with an NFC app.');
      return;
    }
    setWriting(true);
    try {
      const writer = new window.NDEFReader();
      await writer.write({ records: [{ recordType: 'url', data: targetUrl }] });
      setStatus(`${label} written successfully. Tap the tag with a phone to verify it.`);
    } catch (error) {
      setStatus(error.message || 'NFC writing was cancelled or the tag could not be reached.');
    } finally {
      setWriting(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={writeUrl} disabled={writing || !url}>
          <Radio size={14} /> {writing ? 'Hold phone near tag…' : 'Write NFC tag'}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={copyUrl} disabled={!url}>
          <Copy size={14} /> Copy link
        </Button>
      </div>
      {status && <p role="status" className="text-xs text-surface-on-variant">{status}</p>}
    </div>
  );
}
