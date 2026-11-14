import { useEffect, useRef, useState } from 'react';
import { Copy, Plus, Radio, ScanLine, Trash2, X } from 'lucide-react';
import Button from './ui/Button';

const uriPrefixes = [
  '', 'http://www.', 'https://www.', 'http://', 'https://', 'tel:', 'mailto:',
  'ftp://anonymous:anonymous@', 'ftp://ftp.', 'ftps://', 'sftp://', 'smb://',
  'nfs://', 'ftp://', 'dav://', 'news:', 'telnet://', 'imap:', 'rtsp://', 'urn:',
  'pop:', 'sip:', 'sips:', 'tftp://', 'btspp://', 'btl2cap://', 'btgoep://',
  'tcpobex://', 'irdaobex://', 'file://', 'urn:epc:id:', 'urn:epc:tag:',
  'urn:epc:pat:', 'urn:epc:raw:', 'urn:epc:', 'urn:nfc:',
];

const recordTypes = [
  ['text', 'Text'],
  ['url-uri', 'URL / URI'],
  ['unit-link', 'Universal link (unit.link)'],
  ['application', 'Application (Android app)'],
  ['social', 'Social network'],
  ['video', 'Video'],
  ['search', 'Search'],
  ['file', 'File attachment'],
  ['mail', 'Email'],
  ['contact', 'Contact (vCard)'],
  ['phone', 'Phone number'],
  ['sms', 'SMS'],
  ['location', 'Location'],
  ['payment', 'Payment link'],
  ['wifi', 'Wi-Fi network'],
  ['shortcut', 'Shortcut'],
];

function makeRecord(type, value = '') {
  const record = { id: `${Date.now()}-${Math.random()}`, type };
  if (type === 'search') return { ...record, query: '' };
  if (type === 'application') return { ...record, packageName: '' };
  if (type === 'mail') return { ...record, email: '', subject: '', body: '' };
  if (type === 'contact') return { ...record, name: '', phone: '', email: '', organization: '' };
  if (type === 'sms') return { ...record, phone: '', body: '' };
  if (type === 'location') return { ...record, latitude: '', longitude: '', label: '' };
  if (type === 'wifi') return { ...record, ssid: '', password: '', security: 'WPA2' };
  if (type === 'shortcut') return { ...record, title: '', value: '' };
  if (type === 'file') return { ...record, file: null };
  if (type === 'phone') return { ...record, value: '' };
  return { ...record, value };
}

function normalizeUri(value, httpOnly = false) {
  let uri;
  try {
    uri = new URL(String(value || '').trim());
  } catch {
    throw new Error('Enter a valid URL or URI.');
  }
  if (httpOnly && !['https:', 'http:'].includes(uri.protocol)) {
    throw new Error('This record requires an http:// or https:// link.');
  }
  return uri.href;
}

function textBytes(value) {
  return new TextEncoder().encode(value);
}

function toNdefText(value) {
  if (!String(value || '').trim()) throw new Error('Text records cannot be empty.');
  return { recordType: 'text', data: value };
}

function toNdefUri(value, httpOnly = false) {
  const uri = normalizeUri(value, httpOnly);
  return {
    recordType: ['http:', 'https:'].includes(new URL(uri).protocol) ? 'url' : 'absolute-url',
    data: uri,
  };
}

function required(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function escapeVcard(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function joinBytes(...parts) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
}

function wscAttribute(type, value) {
  if (value.length > 65535) throw new Error('The Wi-Fi record is too large.');
  return new Uint8Array([type >> 8, type & 0xff, value.length >> 8, value.length & 0xff, ...value]);
}

function makeWifiRecord(record) {
  const ssid = textBytes(required(record.ssid, 'Wi-Fi name'));
  if (ssid.length > 32) throw new Error('Wi-Fi names can be at most 32 UTF-8 bytes.');
  const open = record.security === 'Open';
  const passwordText = String(record.password || '');
  const password = textBytes(passwordText);
  const validPasswordLength = password.length >= 8 && password.length <= 63;
  const validHexPsk = password.length === 64 && /^[0-9a-f]+$/i.test(passwordText);
  if (!open && !validPasswordLength && !validHexPsk) {
    throw new Error('Wi-Fi passwords must be 8–63 UTF-8 bytes, or a 64-character hexadecimal key.');
  }
  const auth = record.security === 'WPA/WPA2' ? 0x0022 : open ? 0x0001 : 0x0020;
  const encryption = open ? 0x0001 : record.security === 'WPA/WPA2' ? 0x000c : 0x0008;
  const credential = joinBytes(
    wscAttribute(0x1026, new Uint8Array([1])),
    wscAttribute(0x1045, ssid),
    wscAttribute(0x1003, new Uint8Array([auth >> 8, auth & 0xff])),
    wscAttribute(0x100f, new Uint8Array([encryption >> 8, encryption & 0xff])),
    wscAttribute(0x1028, new Uint8Array([1])),
    open ? new Uint8Array() : wscAttribute(0x1027, password),
    wscAttribute(0x1020, new Uint8Array(6)),
  );
  const payload = joinBytes(
    wscAttribute(0x104a, new Uint8Array([0x10])),
    wscAttribute(0x100e, credential),
  );
  return { recordType: 'mime', mediaType: 'application/vnd.wfa.wsc', data: payload };
}

function buildNdefRecords(record) {
  switch (record.type) {
    case 'text':
      return [toNdefText(record.value)];
    case 'url-uri':
      return [toNdefUri(record.value)];
    case 'unit-link':
    case 'social':
    case 'video':
    case 'payment':
      return [toNdefUri(record.value, true)];
    case 'application': {
      const packageName = required(record.packageName, 'Android package name');
      if (!/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(packageName)) {
        throw new Error('Enter a valid Android package name, such as com.example.app.');
      }
      return [{ recordType: 'android.com:pkg', data: packageName }];
    }
    case 'search': {
      const query = required(record.query, 'Search terms');
      const target = new URL('https://www.google.com/search');
      target.searchParams.set('q', query);
      return [toNdefUri(target.href, true)];
    }
    case 'file': {
      if (!(record.file instanceof File)) throw new Error('Choose a file to add to the tag.');
      if (record.file.size > 32768) throw new Error('Files must be 32 KB or smaller. Tag capacity may be lower.');
      return [{
        recordType: 'mime',
        mediaType: record.file.type || 'application/octet-stream',
        id: record.file.name,
        data: new Uint8Array(),
        file: record.file,
      }];
    }
    case 'mail': {
      const email = required(record.email, 'Email address');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
      const target = new URL(`mailto:${email}`);
      if (record.subject) target.searchParams.set('subject', record.subject);
      if (record.body) target.searchParams.set('body', record.body);
      return [toNdefUri(target.href)];
    }
    case 'contact': {
      const name = required(record.name, 'Contact name');
      if (record.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email.trim())) {
        throw new Error('Enter a valid contact email address.');
      }
      const vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${escapeVcard(name)}`,
        record.organization && `ORG:${escapeVcard(record.organization)}`,
        record.phone && `TEL;TYPE=WORK,VOICE:${escapeVcard(record.phone)}`,
        record.email && `EMAIL:${escapeVcard(record.email)}`,
        'END:VCARD',
      ].filter(Boolean).join('\r\n');
      return [{ recordType: 'mime', mediaType: 'text/vcard', data: vcard }];
    }
    case 'phone': {
      const phone = required(record.value, 'Phone number');
      if (!/^\+?[0-9\s().-]+$/.test(phone)) throw new Error('Enter a valid phone number.');
      return [toNdefUri(`tel:${phone.replace(/[\s().-]/g, '')}`)];
    }
    case 'sms': {
      const phone = required(record.phone, 'Phone number');
      if (!/^\+?[0-9\s().-]+$/.test(phone)) throw new Error('Enter a valid phone number.');
      const target = new URL(`sms:${phone.replace(/[\s().-]/g, '')}`);
      if (record.body) target.searchParams.set('body', record.body);
      return [toNdefUri(target.href)];
    }
    case 'location': {
      const latitude = Number(required(record.latitude, 'Latitude'));
      const longitude = Number(required(record.longitude, 'Longitude'));
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new Error('Enter valid coordinates (latitude −90 to 90, longitude −180 to 180).');
      }
      const label = record.label ? `?q=${encodeURIComponent(record.label)}` : '';
      return [toNdefUri(`geo:${latitude},${longitude}${label}`)];
    }
    case 'wifi':
      return [makeWifiRecord(record)];
    case 'shortcut': {
      const title = required(record.title, 'Shortcut title');
      return [toNdefText(title), toNdefUri(record.value)];
    }
    default:
      throw new Error('Choose a supported NDEF record type.');
  }
}

function getRecordBytes(record) {
  if (!(record.data instanceof DataView)) return new Uint8Array();
  return new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength);
}

function describeNdefRecord(record) {
  const bytes = getRecordBytes(record);
  if ((record.recordType === 'url' || record.recordType === 'absolute-url') && bytes.length) {
    const prefix = record.recordType === 'url' ? uriPrefixes[bytes[0]] : undefined;
    const suffix = new TextDecoder().decode(record.recordType === 'url' ? bytes.slice(1) : bytes);
    return { type: 'URL / URI', value: prefix === undefined ? suffix : `${prefix}${suffix}` };
  }
  if (record.recordType === 'text' && bytes.length) {
    const languageLength = bytes[0] & 0x3f;
    const encoding = bytes[0] & 0x80 ? 'utf-16' : 'utf-8';
    return { type: 'Text', value: new TextDecoder(encoding).decode(bytes.slice(1 + languageLength)) };
  }
  if (record.recordType === 'empty') return { type: 'Empty record', value: '' };
  const details = [record.mediaType, record.id].filter(Boolean).join(' · ');
  return {
    type: record.recordType || 'Unknown record',
    value: details || (bytes.length ? `${bytes.length} data bytes` : 'No readable payload'),
  };
}

function readRecordSummaries(message) {
  return (message?.records || []).flatMap((record) => {
    const summary = describeNdefRecord(record);
    const nestedRecords = record.recordType === 'smart-poster' ? record.toRecords?.() || [] : [];
    return [summary, ...nestedRecords.map(describeNdefRecord)];
  });
}

function RecordFields({ record, onChange }) {
  const input = (key, label, props = {}) => (
    <label className="block text-xs">
      <span className="mb-1 block text-surface-on-variant">{label}</span>
      <input {...props} value={record[key] || ''} onChange={(event) => onChange(key, event.target.value)} className="input-field w-full" />
    </label>
  );
  const textarea = (key, label) => (
    <label className="block text-xs">
      <span className="mb-1 block text-surface-on-variant">{label}</span>
      <textarea value={record[key] || ''} onChange={(event) => onChange(key, event.target.value)} className="input-field w-full" rows={2} />
    </label>
  );
  const select = (key, label, options) => (
    <label className="block text-xs">
      <span className="mb-1 block text-surface-on-variant">{label}</span>
      <select value={record[key]} onChange={(event) => onChange(key, event.target.value)} className="input-field w-full">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );

  switch (record.type) {
    case 'text': return input('value', 'Text content');
    case 'url-uri': return input('value', 'URL or URI', { type: 'url', placeholder: 'https://example.com' });
    case 'unit-link': return input('value', 'Universal / app link', { type: 'url', placeholder: 'https://example.com/app-link' });
    case 'application': return input('packageName', 'Android package name', { placeholder: 'com.example.app' });
    case 'social': return input('value', 'Social profile URL', { type: 'url', placeholder: 'https://social.example/profile' });
    case 'video': return input('value', 'Video URL', { type: 'url', placeholder: 'https://video.example/watch/...' });
    case 'search': return input('query', 'Search terms', { placeholder: 'Search for…' });
    case 'file':
      return (
        <label className="block text-xs">
          <span className="mb-1 block text-surface-on-variant">File (up to 32 KB; tag capacity may be lower)</span>
          <input type="file" onChange={(event) => onChange('file', event.target.files?.[0] || null)} className="block w-full text-xs" />
          {record.file && <span className="mt-1 block break-all text-surface-on-variant">{record.file.name} · {record.file.size} bytes</span>}
        </label>
      );
    case 'mail':
      return <div className="grid gap-2 sm:grid-cols-2">{input('email', 'Email address', { type: 'email' })}{input('subject', 'Subject')}{textarea('body', 'Message')}</div>;
    case 'contact':
      return <div className="grid gap-2 sm:grid-cols-2">{input('name', 'Full name')}{input('phone', 'Phone number', { type: 'tel' })}{input('email', 'Email address', { type: 'email' })}{input('organization', 'Organization')}</div>;
    case 'phone': return input('value', 'Phone number', { type: 'tel', placeholder: '+255…' });
    case 'sms': return <div className="grid gap-2 sm:grid-cols-2">{input('phone', 'Phone number', { type: 'tel', placeholder: '+255…' })}{textarea('body', 'SMS message')}</div>;
    case 'location':
      return <div className="grid gap-2 sm:grid-cols-2">{input('latitude', 'Latitude', { type: 'number', step: 'any' })}{input('longitude', 'Longitude', { type: 'number', step: 'any' })}{input('label', 'Place label (optional)')}</div>;
    case 'payment': return input('value', 'Payment URL', { type: 'url', placeholder: 'https://…' });
    case 'wifi':
      return <div className="grid gap-2 sm:grid-cols-2">{input('ssid', 'Wi-Fi network name')}{record.security !== 'Open' && input('password', 'Wi-Fi password', { type: 'password' })}{select('security', 'Security', ['WPA2', 'WPA/WPA2', 'Open'])}</div>;
    case 'shortcut':
      return <div className="grid gap-2 sm:grid-cols-2">{input('title', 'Shortcut title')}{input('value', 'Shortcut URL', { type: 'url', placeholder: 'https://…' })}</div>;
    default: return null;
  }
}

export default function NfcTagWriter({ url, label = 'NFC tag', linkType = 'Website link' }) {
  const [status, setStatus] = useState('');
  const [writing, setWriting] = useState(false);
  const [reading, setReading] = useState(false);
  const [readRecords, setReadRecords] = useState([]);
  const [records, setRecords] = useState(() => [makeRecord('url-uri', url || '')]);
  const readController = useRef(null);

  useEffect(() => {
    setRecords((current) => current[0]?.type === 'url-uri'
      ? [{ ...current[0], value: url || '' }]
      : current);
  }, [url]);

  useEffect(() => () => readController.current?.abort(), []);

  const updateRecord = (recordId, key, value) => {
    setRecords((current) => current.map((record) => record.id === recordId ? { ...record, [key]: value } : record));
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(normalizeUri(url, true));
      setStatus(`${label} link copied.`);
    } catch (error) {
      setStatus(error.message || 'Could not copy the NFC link. Check clipboard permission.');
    }
  };

  const writeRecords = async () => {
    setStatus('');
    if (!window.isSecureContext) {
      setStatus('Direct NFC writing requires HTTPS. Open the POS website using its secure https:// address.');
      return;
    }
    if (typeof window.NDEFReader !== 'function') {
      setStatus('This browser does not support Web NFC. Use NFC-enabled Android Chrome, or copy a link and write it with an NFC app.');
      return;
    }
    if (!records.length) {
      setStatus('Add at least one record before writing the tag.');
      return;
    }

    let ndefRecords;
    try {
      ndefRecords = (await Promise.all(records.map(async (record) => {
        const built = buildNdefRecords(record);
        return Promise.all(built.map(async (ndefRecord) => {
          if (ndefRecord.file) {
            return { ...ndefRecord, data: new Uint8Array(await ndefRecord.file.arrayBuffer()) };
          }
          return ndefRecord;
        }));
      }))).flat(2);
    } catch (error) {
      setStatus(error.message || 'Could not prepare the NFC records.');
      return;
    }

    setWriting(true);
    try {
      const writer = new window.NDEFReader();
      await writer.write({ records: ndefRecords });
      setStatus(`${ndefRecords.length} NDEF record${ndefRecords.length === 1 ? '' : 's'} written. Tap Read tag to verify.`);
    } catch (error) {
      setStatus(error.message || 'NFC writing was cancelled or the tag could not be reached. Check the tag capacity and supported record types.');
    } finally {
      setWriting(false);
    }
  };

  const stopReading = () => {
    readController.current?.abort();
    readController.current = null;
    setReading(false);
    setStatus('NFC scan stopped.');
  };

  const readTag = async () => {
    setStatus('');
    setReadRecords([]);
    if (!window.isSecureContext) {
      setStatus('NFC reading requires HTTPS. Open the POS website using its secure https:// address.');
      return;
    }
    if (typeof window.NDEFReader !== 'function') {
      setStatus('This browser does not support Web NFC. Use NFC-enabled Android Chrome to read NDEF tags.');
      return;
    }

    const controller = new AbortController();
    readController.current = controller;
    const reader = new window.NDEFReader();
    const onReading = (event) => {
      const summaries = readRecordSummaries(event.message);
      setReadRecords(summaries);
      setStatus(summaries.length ? 'Tag read. Check the records below.' : 'Tag read, but it contains no NDEF records.');
      setReading(false);
      readController.current = null;
      controller.abort();
    };
    const onReadingError = () => {
      setStatus('A tag was detected but its NDEF data could not be read. The tag may be locked, unsupported, or damaged.');
      setReading(false);
      readController.current = null;
      controller.abort();
    };

    reader.addEventListener('reading', onReading, { once: true });
    reader.addEventListener('readingerror', onReadingError, { once: true });
    setReading(true);
    setStatus('Hold an NDEF-compatible NFC tag near the back of the phone…');
    try {
      await reader.scan({ signal: controller.signal });
    } catch (error) {
      if (error.name !== 'AbortError') {
        setStatus(error.message || 'Could not start NFC reading. Check browser permission and try again.');
        setReading(false);
        readController.current = null;
      }
    }
  };

  return (
    <div className="min-w-0 space-y-2">
      <div className="min-w-0 rounded-lg bg-white/80 p-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-surface-on-variant">NFC profile: {linkType}</p>
        <p className="mt-1 text-[10px] text-surface-on-variant">A tag can hold multiple NDEF records. Text, contact, Wi-Fi, and file records may contain information readable by anyone who scans the tag.</p>
      </div>
      <details className="rounded-lg border border-outline-variant bg-white/70 p-2">
        <summary className="cursor-pointer text-xs font-semibold">Configure records ({records.length})</summary>
        <div className="mt-3 space-y-3">
          {records.map((record, index) => (
            <div key={record.id} className="space-y-2 rounded-lg border border-outline-variant p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">Record {index + 1}</span>
                <button type="button" className="inline-flex items-center gap-1 text-xs text-error" onClick={() => setRecords((current) => current.filter((item) => item.id !== record.id))} aria-label={`Remove record ${index + 1}`}>
                  <Trash2 size={13} /> Remove
                </button>
              </div>
              <label className="block text-xs">
                <span className="mb-1 block text-surface-on-variant">Record type</span>
                <select value={record.type} onChange={(event) => {
                  const replacement = makeRecord(event.target.value);
                  setRecords((current) => current.map((item) => item.id === record.id ? { ...replacement, id: record.id } : item));
                }} className="input-field w-full">
                  {recordTypes.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                </select>
              </label>
              <RecordFields record={record} onChange={(key, value) => updateRecord(record.id, key, value)} />
            </div>
          ))}
          <Button type="button" size="sm" variant="secondary" onClick={() => setRecords((current) => [...current, makeRecord('text')])}>
            <Plus size={14} /> Add record
          </Button>
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={writeRecords} disabled={writing || reading}>
          <Radio size={14} /> {writing ? 'Hold phone near tag…' : 'Write NFC tag'}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={readTag} disabled={writing || reading}>
          <ScanLine size={14} /> Read tag
        </Button>
        {reading && <Button type="button" size="sm" variant="secondary" onClick={stopReading}><X size={14} /> Stop scan</Button>}
        {url && <Button type="button" size="sm" variant="secondary" onClick={copyUrl}>
          <Copy size={14} /> Copy link
        </Button>}
      </div>
      {status && <p role="status" aria-live="polite" className="break-words text-xs text-surface-on-variant">{status}</p>}
      {readRecords.length > 0 && (
        <div className="space-y-1 rounded-lg border border-outline-variant bg-white p-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-surface-on-variant">Tag contents</p>
          {readRecords.map((record, index) => (
            <div key={`${record.type}-${index}`} className="min-w-0">
              <p className="text-[10px] font-semibold text-surface-on-variant">{record.type}</p>
              <p className="break-all text-xs text-surface-on">{record.value || 'No content'}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-surface-on-variant">Read/write works in NFC-enabled Android Chrome over HTTPS with NDEF-compatible tags. iPhone and unsupported tags need a compatible NFC app or reader. NFC tag capacity varies; file and Wi-Fi records may not fit. Payment links and embedded Wi-Fi credentials are public to anyone who scans the tag.</p>
    </div>
  );
}
