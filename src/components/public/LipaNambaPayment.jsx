import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, QrCode, Smartphone } from 'lucide-react';
import InternalQrCode from '../ui/InternalQrCode';

export default function LipaNambaPayment({ number, accounts = [], reference, onReferenceChange }) {
  const [copied, setCopied] = useState(false);
  const [cartElement, setCartElement] = useState(null);
  const [accountIndex, setAccountIndex] = useState(0);
  const paymentAccounts = accounts.length ? accounts : [{ label: 'Lipa Namba', number, qrImage: '', useInternalQr: true }];
  const account = paymentAccounts[Math.min(accountIndex, paymentAccounts.length - 1)];

  useEffect(() => {
    setCartElement(document.querySelector('.public-cart'));
  }, []);

  const copyNumber = async () => {
    await navigator.clipboard?.writeText(account.number || number);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const payment = (
    <div className="lipa-payment-card">
      <div className="lipa-payment-heading"><div><span>PAY BEFORE PREPARATION</span><strong>Lipa Namba payment</strong></div><Smartphone size={18} /></div>
      <p className="lipa-payment-copy">Copy the number or scan the QR code with your phone camera / mobile wallet, then enter payment reference below.</p>
      {paymentAccounts.length > 1 && <label className="lipa-account-picker">Payment account<select value={accountIndex} onChange={(event) => setAccountIndex(Number(event.target.value))}>{paymentAccounts.map((item, index) => <option key={`${item.number}-${index}`} value={index}>{item.label || `Lipa Namba ${index + 1}`} - {item.number}</option>)}</select></label>}
      <div className="lipa-payment-number"><div><small>{account.label || 'Lipa Namba number'}</small><strong>{account.number}</strong></div><button type="button" onClick={copyNumber} aria-label="Copy Lipa Namba number">{copied ? <Check size={17} /> : <Copy size={17} />}</button></div>
      <a className="lipa-ussd-link" href="tel:*150*00#"><Smartphone size={14} /> Open USSD on phone</a>
      <div className="lipa-qr" aria-label="Lipa Namba QR code payment" role="img">
        <InternalQrCode
          number={account.number || number}
          useInternal={true}
          alt={`${account.label || 'Lipa Namba'} QR code`}
          className="w-44 h-44 aspect-square mx-auto p-2 bg-white rounded-xl border-2 border-[#ae002a] object-contain shadow-sm"
        />
        <div className="flex items-center justify-center gap-1.5 text-xs text-[#746e67] font-semibold mt-1">
          <QrCode size={15} className="text-[#ae002a]" />
          <span>Scan to get Lipa Namba: <strong className="text-[#ae002a] font-mono">{account.number || number}</strong></span>
        </div>
      </div>
      <label className="lipa-reference-label">Payment reference<input required value={reference} onChange={(event) => onReferenceChange(event.target.value)} placeholder="e.g. MPESA12345" /></label>
    </div>
  );

  return cartElement ? createPortal(payment, cartElement) : null;
}
