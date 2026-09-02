import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, QrCode, Smartphone } from 'lucide-react';

export default function LipaNambaPayment({ number, accounts = [], reference, onReferenceChange }) {
  const [copied, setCopied] = useState(false);
  const [cartElement, setCartElement] = useState(null);
  const [accountIndex, setAccountIndex] = useState(0);
  const paymentAccounts = accounts.length ? accounts : [{ label: 'Lipa Namba', number, qrImage: '' }];
  const account = paymentAccounts[Math.min(accountIndex, paymentAccounts.length - 1)];

  useEffect(() => {
    setCartElement(document.querySelector('.public-cart'));
  }, []);

  const copyNumber = async () => {
    await navigator.clipboard?.writeText(number);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const payment = (
    <div className="lipa-payment-card">
      <div className="lipa-payment-heading"><div><span>PAY BEFORE PREPARATION</span><strong>Lipa Namba payment</strong></div><Smartphone size={18} /></div>
      <p className="lipa-payment-copy">Copy the number, pay by USSD on your phone, then enter the payment reference below.</p>
      {paymentAccounts.length > 1 && <label className="lipa-account-picker">Payment account<select value={accountIndex} onChange={(event) => setAccountIndex(Number(event.target.value))}>{paymentAccounts.map((item, index) => <option key={`${item.number}-${index}`} value={index}>{item.label || `Lipa Namba ${index + 1}`} - {item.number}</option>)}</select></label>}
      <div className="lipa-payment-number"><div><small>{account.label || 'Lipa Namba number'}</small><strong>{account.number}</strong></div><button type="button" onClick={copyNumber} aria-label="Copy Lipa Namba number">{copied ? <Check size={17} /> : <Copy size={17} />}</button></div>
      <a className="lipa-ussd-link" href="tel:*150*00#"><Smartphone size={14} /> Open USSD on phone</a>
      <div className="lipa-qr" aria-label="Lipa Namba QR code payment" role="img"><img src={account.qrImage || '/lipa-namba-qr-logo.png'} alt={`${account.label || 'Lipa Namba'} QR code`} /><div><QrCode size={16} /><span>Scan or use USSD</span></div></div>
      <label className="lipa-reference-label">Payment reference<input required value={reference} onChange={(event) => onReferenceChange(event.target.value)} placeholder="e.g. MPESA12345" /></label>
    </div>
  );

  return cartElement ? createPortal(payment, cartElement) : null;
}
