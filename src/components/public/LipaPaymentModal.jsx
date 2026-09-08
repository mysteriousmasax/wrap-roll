import { useState, useEffect } from 'react';
import {
  Check,
  Copy,
  QrCode,
  Smartphone,
  X,
  Clock,
  ChefHat,
  AlertCircle,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/format';
import { useWebSocket } from '../../hooks/useWebSocket';
import InternalQrCode from '../ui/InternalQrCode';

const NETWORKS = [
  {
    id: 'mixx',
    name: 'Mixx by Yas / TIPS',
    color: '#004aad',
    ussd: '*150*01#',
    badge: 'TIPS Direct',
    steps: [
      'Piga *150*01#',
      'Chagua 4 (Lipa kwa Simu / TIPS)',
      'Chagua 1 (Lipa Namba)',
      'Weka Lipa Namba: 45342017',
      'Jina litatokea: PETER JOSEPH MSIRA',
      'Weka Kiasi na Kumbukumbu',
      'Weka PIN kuthibitisha',
    ],
  },
  {
    id: 'mpesa',
    name: 'Vodacom M-Pesa',
    color: '#e60000',
    ussd: '*150*00#',
    badge: 'TIPS / M-Pesa',
    steps: [
      'Piga *150*00#',
      'Chagua 4 (Lipa kwa M-Pesa)',
      'Chagua 1 (Lipa kwa Simu / TIPS Mitandao Yote)',
      'Weka Lipa Namba: 45342017 (PETER JOSEPH MSIRA)',
      'Weka Kiasi kamili',
      'Weka Namba ya Kumbukumbu',
      'Weka PIN yako kukamilisha',
    ],
  },
  {
    id: 'airtel',
    name: 'Airtel Money',
    color: '#ff0000',
    ussd: '*150*60#',
    badge: 'TIPS / Airtel',
    steps: [
      'Piga *150*60#',
      'Chagua 5 (Lipa Bili / Lipa kwa Simu)',
      'Chagua 1 (Mitandao Mingine / TIPS)',
      'Weka Lipa Namba: 45342017 (PETER JOSEPH MSIRA)',
      'Weka Kiasi na Kumbukumbu',
      'Weka PIN kuthibitisha',
    ],
  },
  {
    id: 'halopesa',
    name: 'Halopesa',
    color: '#ff7700',
    ussd: '*150*88#',
    badge: 'TIPS / Halopesa',
    steps: [
      'Piga *150*88#',
      'Chagua 5 (Lipa kwa Halopesa / TIPS)',
      'Weka Lipa Namba: 45342017 (PETER JOSEPH MSIRA)',
      'Weka Kiasi na Kumbukumbu',
      'Weka PIN kuthibitisha',
    ],
  },
];

export default function LipaPaymentModal({
  order,
  isOpen,
  onClose,
  currency = 'TZS',
}) {
  const [selectedNetwork, setSelectedNetwork] = useState(NETWORKS[0]);
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [smsTransactionId, setSmsTransactionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [liveOrder, setLiveOrder] = useState(order);

  const lipaNumber = '45342017';
  const merchantName = 'PETER JOSEPH MSIRA';
  const paymentRef = liveOrder?.paymentReference || `WRPAY-${liveOrder?.id?.replace(/^WR-/, '')}`;

  // Poll for real-time payment and order status updates
  useEffect(() => {
    if (!liveOrder?.id || !isOpen) return;

    const pollStatus = async () => {
      try {
        const statusRes = await api.getPaymentStatus(paymentRef);
        if (statusRes.success) {
          setLiveOrder((prev) => ({
            ...prev,
            paymentStatus: statusRes.status,
            orderStatus: statusRes.orderStatus,
            paidAt: statusRes.paidAt,
          }));
        }
      } catch (err) {
        // Silent polling catch
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 3500);
    return () => clearInterval(interval);
  }, [liveOrder?.id, paymentRef, isOpen]);

  // WebSocket real-time update handler
  useWebSocket((event, data) => {
    if (event === 'order:updated' || event === 'order:confirmed') {
      if (data?.id === liveOrder?.id || data?.orderNumber === liveOrder?.orderNumber) {
        setLiveOrder(data);
      }
    }
  });

  const handleCopyNumber = async () => {
    await navigator.clipboard?.writeText(lipaNumber);
    setCopiedNumber(true);
    setTimeout(() => setCopiedNumber(false), 2000);
  };

  const handleCopyRef = async () => {
    await navigator.clipboard?.writeText(paymentRef);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  const handleSubmitManual = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage('');

    try {
      const res = await api.submitManualPayment({
        paymentReference: paymentRef,
        transactionId: smsTransactionId.trim(),
        senderPhone: liveOrder?.customerPhone,
        senderName: liveOrder?.customer,
      });

      if (res.success) {
        setSubmitSuccess(true);
        setLiveOrder((prev) => ({
          ...prev,
          paymentStatus: 'manual_review',
        }));
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to submit payment details.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !liveOrder) return null;

  const isPaid = liveOrder.paymentStatus === 'paid';
  const isManualReview = liveOrder.paymentStatus === 'manual_review';
  const isFailed = liveOrder.paymentStatus === 'failed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in">
      <div
        className="bg-[#fffdfa] border border-[#ebdccb] w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#1f1d1b] text-white p-5 sm:p-6 flex items-center justify-between relative">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ffc72c] animate-pulse"></span>
              <p className="text-[11px] uppercase tracking-widest text-[#ffc72c] font-black">
                Wrap &amp; Roll Payment
              </p>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-display text-white">
              Order {liveOrder.orderNumber || liveOrder.id}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Amount & Status Bar */}
        <div className="bg-[#faeee2] border-b border-[#ebdccb] px-6 py-4 flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-[11px] text-[#746e67] uppercase font-bold tracking-wider">
              Amount Due
            </span>
            <p className="text-2xl font-black text-[#ae002a]">
              {formatCurrency(liveOrder.total, currency)}
            </p>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-[#746e67] uppercase font-bold tracking-wider">
              Payment Status
            </span>
            <div className="mt-0.5">
              {isPaid ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black shadow-sm">
                  <Check size={14} className="stroke-[3]" /> PAID &amp; CONFIRMED
                </span>
              ) : isManualReview ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold animate-pulse">
                  <Clock size={14} /> MANUAL REVIEW
                </span>
              ) : isFailed ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-bold">
                  <AlertCircle size={14} /> PAYMENT FAILED
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">
                  <Clock size={14} /> PENDING PAYMENT
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* If Paid: Show Success Celebration Screen */}
          {isPaid ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                <Check size={36} className="stroke-[3]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-[#1f1d1b]">
                  Payment Verified Successfully!
                </h3>
                <p className="text-xs text-[#746e67] max-w-sm mx-auto">
                  Your funds have been verified and your order has been sent to the kitchen display for preparation.
                </p>
              </div>

              <div className="bg-[#fbf6ee] border border-[#ebdccb] rounded-2xl p-4 text-xs space-y-2 text-left max-w-sm mx-auto">
                <div className="flex justify-between">
                  <span className="text-[#746e67]">Order Ref:</span>
                  <strong className="text-[#1f1d1b]">{liveOrder.orderNumber || liveOrder.id}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#746e67]">Payment Ref:</span>
                  <strong className="text-[#ae002a]">{paymentRef}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#746e67]">Kitchen Status:</span>
                  <strong className="text-emerald-700 uppercase">{liveOrder.status || 'CONFIRMED'}</strong>
                </div>
              </div>

              <button
                onClick={onClose}
                className="px-6 py-3 rounded-2xl bg-[#ae002a] text-white font-bold text-xs hover:bg-[#920023] transition-colors shadow-md"
              >
                Track Order Status
              </button>
            </div>
          ) : (
            <>
              {/* Payment Reference Callout */}
              <div className="bg-[#fff9f4] border-2 border-[#ebdccb] rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#746e67] font-bold">Unique Payment Reference:</span>
                  <button
                    type="button"
                    onClick={handleCopyRef}
                    className="text-xs font-bold text-[#ae002a] hover:underline inline-flex items-center gap-1"
                  >
                    {copiedRef ? <Check size={13} /> : <Copy size={13} />}
                    {copiedRef ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-[#ebdccb] text-center font-mono font-black text-sm tracking-wider text-[#ae002a]">
                  {paymentRef}
                </div>
                <p className="text-[10px] text-[#746e67] text-center">
                  Always enter this reference when paying via USSD or Mobile Banking.
                </p>
              </div>

              {/* Lipa Namba & QR Code Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center bg-white border border-[#ebdccb] rounded-2xl p-4 shadow-sm">
                {/* QR Code */}
                <div className="flex flex-col items-center justify-center p-2 text-center border-b sm:border-b-0 sm:border-r border-[#eee4d5] pb-4 sm:pb-0 sm:pr-4">
                  <div className="bg-white p-2 rounded-2xl border-2 border-[#004aad] shadow-md relative">
                    <InternalQrCode
                      number={lipaNumber}
                      useInternal={true}
                      alt="Wrap & Roll TIPS QR Code"
                      className="w-36 h-36 aspect-square object-contain rounded-xl"
                    />
                  </div>
                  <span className="text-[10px] text-[#004aad] font-bold mt-2 flex items-center gap-1">
                    <QrCode size={12} /> Scan with Camera / Banking App
                  </span>
                </div>

                {/* Lipa Namba Details */}
                <div className="space-y-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#746e67] tracking-wider">
                      Lipa Namba (TIPS)
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-2xl font-black text-[#1f1d1b] tracking-wider">
                        {lipaNumber}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyNumber}
                        className="p-1.5 rounded-lg bg-[#faeee2] text-[#ae002a] hover:bg-[#f6e0cd] transition-colors"
                        title="Copy Lipa Namba"
                      >
                        {copiedNumber ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#746e67] tracking-wider">
                      Merchant Name
                    </span>
                    <p className="text-xs font-bold text-[#1f1d1b]">{merchantName}</p>
                  </div>

                  <a
                    href={`tel:${selectedNetwork.ussd}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#004aad] text-white text-xs font-bold hover:bg-[#003780] transition-colors w-full justify-center shadow-sm"
                  >
                    <Smartphone size={14} /> Open USSD ({selectedNetwork.ussd})
                  </a>
                </div>
              </div>

              {/* Network Selector Tabs */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-[#1f1d1b]">
                  Choose Your Network for Step-by-Step Instructions:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {NETWORKS.map((net) => (
                    <button
                      key={net.id}
                      type="button"
                      onClick={() => setSelectedNetwork(net)}
                      className={
                        'px-2.5 py-2 rounded-xl text-xs font-bold border transition-all text-center flex flex-col items-center ' +
                        (selectedNetwork.id === net.id
                          ? 'border-[#ae002a] bg-[#ae002a] text-white shadow-md'
                          : 'border-[#ebdccb] bg-white text-[#554e46] hover:bg-[#faeee2]')
                      }
                    >
                      <span>{net.name.split(' ')[0]}</span>
                      <span className="text-[9px] opacity-80">{net.ussd}</span>
                    </button>
                  ))}
                </div>

                {/* Selected Network Steps */}
                <div className="p-4 rounded-2xl bg-[#fbf6ee] border border-[#ebdccb] space-y-2">
                  <p className="text-xs font-bold text-[#ae002a] flex items-center gap-1">
                    <ShieldCheck size={14} /> {selectedNetwork.name} Payment Steps:
                  </p>
                  <ol className="text-xs text-[#554e46] space-y-1 list-decimal list-inside pl-1 leading-relaxed">
                    {selectedNetwork.steps.map((step, idx) => (
                      <li key={idx}>
                        {step.replace('[WRPAY_REF]', paymentRef)}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              {/* Customer Manual Verification / "I Have Paid" Submission */}
              <div className="pt-2 border-t border-[#eee4d5] space-y-3">
                <div className="flex items-center gap-2">
                  <Smartphone size={16} className="text-[#ae002a]" />
                  <h4 className="text-xs font-bold text-[#1f1d1b]">
                    Already Sent the Payment?
                  </h4>
                </div>

                {isManualReview ? (
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2 text-xs">
                    <p className="font-bold flex items-center gap-1.5">
                      <Clock size={15} /> Payment Reference Received!
                    </p>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Our cashier is verifying your transaction. This window will automatically update as soon as the payment is confirmed.
                    </p>
                    <div className="flex items-center gap-2 pt-1 font-mono text-[11px] font-bold text-amber-900">
                      <RefreshCw size={12} className="animate-spin" /> Auto-refreshing status...
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitManual} className="space-y-3">
                    <p className="text-[11px] text-[#746e67]">
                      Enter the transaction ID from your M-Pesa / Mixx / Airtel SMS to expedite verification:
                    </p>
                    <div className="flex gap-2">
                      <input
                        required
                        value={smsTransactionId}
                        onChange={(e) => setSmsTransactionId(e.target.value)}
                        placeholder="e.g. 9AA34XY789 or TXN..."
                        className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#ebdccb] bg-white text-xs font-mono uppercase focus:outline-none focus:border-[#ae002a]"
                      />
                      <button
                        type="submit"
                        disabled={submitting || !smsTransactionId.trim()}
                        className="px-4 py-2.5 rounded-xl bg-[#ae002a] text-white font-bold text-xs hover:bg-[#920023] transition-colors disabled:opacity-50 whitespace-nowrap shadow-md"
                      >
                        {submitting ? 'Submitting...' : 'I Have Paid'}
                      </button>
                    </div>
                    {errorMessage && (
                      <p className="text-xs font-bold text-rose-600">{errorMessage}</p>
                    )}
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
