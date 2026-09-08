import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Eye,
  Filter,
  CreditCard,
  Smartphone,
  ShieldCheck,
  Check,
  X,
  User,
  Phone,
} from 'lucide-react';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/format';
import { useWebSocket } from '../../hooks/useWebSocket';

export default function PaymentVerificationPage() {
  const [payments, setPayments] = useState([]);
  const [counts, setCounts] = useState({ all: 0, manual_review: 0, paid: 0, pending: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('manual_review');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [verifyNotes, setVerifyNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [actionType, setActionType] = useState(null); // 'verify' | 'reject'

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getPaymentsList({
        status: activeFilter === 'all' ? '' : activeFilter,
        search: searchTerm.trim(),
      });
      if (res.success) {
        setPayments(res.payments || []);
        setCounts(res.counts || {});
      }
    } catch (err) {
      console.error('Failed to load payments:', err);
    } finally {
      setLoading(false);
    }
  }, [activeFilter, searchTerm]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  // Real-time WebSocket listener
  useWebSocket((event) => {
    if (event === 'payment:manual_review' || event === 'payment:confirmed' || event === 'order:updated') {
      loadPayments();
    }
  });

  const handleVerify = async (paymentRef) => {
    setActionLoading(true);
    try {
      await api.verifyManualPayment(paymentRef, verifyNotes);
      setActionType(null);
      setSelectedPayment(null);
      setVerifyNotes('');
      await loadPayments();
    } catch (err) {
      alert(`Verification failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (paymentRef) => {
    setActionLoading(true);
    try {
      await api.rejectManualPayment(paymentRef, rejectReason || 'Transaction could not be verified');
      setActionType(null);
      setSelectedPayment(null);
      setRejectReason('');
      await loadPayments();
    } catch (err) {
      alert(`Rejection failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#eee4d5]">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-[#ae002a]" size={26} />
            <h1 className="text-2xl font-bold font-display text-[#1f1d1b]">
              Payment Verification &amp; Audit
            </h1>
          </div>
          <p className="text-xs text-[#746e67] mt-1">
            Review Lipa Namba and automated mobile money payments before orders are released to the kitchen.
          </p>
        </div>

        <button
          onClick={loadPayments}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#ebdccb] text-xs font-bold text-[#554e46] hover:bg-[#faeee2] transition-colors shadow-sm self-start sm:self-auto"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh List
        </button>
      </div>

      {/* Quick Status Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button
          onClick={() => setActiveFilter('manual_review')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            activeFilter === 'manual_review'
              ? 'bg-amber-500 text-white border-amber-600 shadow-md ring-2 ring-amber-400/30'
              : 'bg-white border-[#ebdccb] hover:bg-amber-50/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${activeFilter === 'manual_review' ? 'text-amber-100' : 'text-[#746e67]'}`}>
              Manual Review
            </span>
            <Clock size={16} />
          </div>
          <p className="text-2xl font-black mt-2">{counts.manual_review || 0}</p>
          <span className={`text-[10px] ${activeFilter === 'manual_review' ? 'text-amber-100' : 'text-[#746e67]'}`}>
            Action required by cashier
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('paid')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            activeFilter === 'paid'
              ? 'bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-400/30'
              : 'bg-white border-[#ebdccb] hover:bg-emerald-50/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${activeFilter === 'paid' ? 'text-emerald-100' : 'text-[#746e67]'}`}>
              Verified Paid
            </span>
            <CheckCircle2 size={16} />
          </div>
          <p className="text-2xl font-black mt-2">{counts.paid || 0}</p>
          <span className={`text-[10px] ${activeFilter === 'paid' ? 'text-emerald-100' : 'text-[#746e67]'}`}>
            Confirmed &amp; in kitchen
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('pending')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            activeFilter === 'pending'
              ? 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-400/30'
              : 'bg-white border-[#ebdccb] hover:bg-blue-50/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${activeFilter === 'pending' ? 'text-blue-100' : 'text-[#746e67]'}`}>
              Pending
            </span>
            <CreditCard size={16} />
          </div>
          <p className="text-2xl font-black mt-2">{counts.pending || 0}</p>
          <span className={`text-[10px] ${activeFilter === 'pending' ? 'text-blue-100' : 'text-[#746e67]'}`}>
            Awaiting customer transfer
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('all')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            activeFilter === 'all'
              ? 'bg-[#1f1d1b] text-white border-black shadow-md ring-2 ring-black/30'
              : 'bg-white border-[#ebdccb] hover:bg-[#fbf6ee]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${activeFilter === 'all' ? 'text-white/70' : 'text-[#746e67]'}`}>
              All Payments
            </span>
            <Filter size={16} />
          </div>
          <p className="text-2xl font-black mt-2">{counts.all || 0}</p>
          <span className={`text-[10px] ${activeFilter === 'all' ? 'text-white/70' : 'text-[#746e67]'}`}>
            Full audit log
          </span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#ebdccb] shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#746e67]" size={16} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Order #, Reference, Phone, Txn ID..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-[#ebdccb] bg-[#fbf6ee] text-xs focus:outline-none focus:border-[#ae002a]"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {['manual_review', 'paid', 'pending', 'failed', 'all'].map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                activeFilter === f
                  ? 'bg-[#ae002a] text-white shadow-sm'
                  : 'bg-[#fbf6ee] text-[#554e46] hover:bg-[#faeee2]'
              }`}
            >
              {f === 'manual_review'
                ? 'Manual Review'
                : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-3xl border border-[#ebdccb] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#fbf6ee] border-b border-[#ebdccb] text-[#746e67] font-bold uppercase tracking-wider text-[11px]">
                <th className="p-4">Order &amp; Reference</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Provider &amp; Txn ID</th>
                <th className="p-4">Status</th>
                <th className="p-4">Date / Time</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee4d5]">
              {payments.length ? (
                payments.map((p) => {
                  const isReview = p.status === 'manual_review';
                  const isPaid = p.status === 'paid';
                  const isFailed = p.status === 'failed';

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-[#fffdfa] transition-colors ${
                        isReview ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      {/* Order Number & Ref */}
                      <td className="p-4 space-y-1">
                        <strong className="text-sm font-bold text-[#1f1d1b] block">
                          {p.orderNumber || p.orderId}
                        </strong>
                        <span className="font-mono text-[11px] font-bold text-[#ae002a] bg-[#faeee2] px-2 py-0.5 rounded-md inline-block">
                          {p.paymentReference}
                        </span>
                      </td>

                      {/* Customer Info */}
                      <td className="p-4 space-y-1">
                        <p className="font-bold text-[#1f1d1b] flex items-center gap-1">
                          <User size={12} className="text-[#746e67]" />
                          {p.customerName || p.senderName || 'Walk-in'}
                        </p>
                        {(p.customerPhone || p.senderPhone) && (
                          <p className="text-[11px] text-[#746e67] flex items-center gap-1 font-mono">
                            <Phone size={11} /> {p.customerPhone || p.senderPhone}
                          </p>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="p-4">
                        <strong className="text-sm font-bold text-[#ae002a]">
                          {formatCurrency(p.amount, p.currency || 'TZS')}
                        </strong>
                      </td>

                      {/* Provider & Txn ID */}
                      <td className="p-4 space-y-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 text-[10px] font-bold uppercase">
                          <Smartphone size={11} /> {p.provider || 'Lipa Namba'}
                        </span>
                        {p.transactionId ? (
                          <p className="font-mono text-[11px] font-bold text-[#1f1d1b]">
                            Txn: {p.transactionId}
                          </p>
                        ) : (
                          <p className="text-[10px] text-[#746e67] italic">No SMS code submitted yet</p>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-4 space-y-1">
                        <div>
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                              <Check size={12} className="stroke-[3]" /> PAID
                            </span>
                          ) : isReview ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold animate-pulse">
                              <Clock size={12} /> MANUAL REVIEW
                            </span>
                          ) : isFailed ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold">
                              <X size={12} /> FAILED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold">
                              <Clock size={12} /> PENDING
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[#746e67] block">
                          Kitchen: <strong className="uppercase">{p.orderStatus || 'PENDING'}</strong>
                        </span>
                      </td>

                      {/* Date / Time */}
                      <td className="p-4 text-[11px] text-[#746e67]">
                        <p>{new Date(p.createdAt).toLocaleDateString()}</p>
                        <p className="font-mono">{new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        {p.verifiedBy && (
                          <p className="text-[10px] text-emerald-700 font-bold mt-1">
                            By: {p.verifiedBy}
                          </p>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        {isReview ? (
                          <div className="inline-flex items-center gap-2 justify-end">
                            <button
                              onClick={() => {
                                setSelectedPayment(p);
                                setActionType('verify');
                              }}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors inline-flex items-center gap-1"
                            >
                              <Check size={14} /> Verify Payment
                            </button>
                            <button
                              onClick={() => {
                                setSelectedPayment(p);
                                setActionType('reject');
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-xs transition-colors"
                              title="Reject Claim"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedPayment(p);
                              setActionType('view');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[#fbf6ee] hover:bg-[#faeee2] text-[#554e46] font-bold text-xs border border-[#ebdccb] transition-colors"
                          >
                            Details
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-xs text-[#746e67]">
                    {loading ? 'Loading payment records...' : 'No payment records match your filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Verify / Reject Modal */}
      {selectedPayment && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white border border-[#ebdccb] w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 animate-slide-up">
            <div className="flex items-center justify-between pb-3 border-b border-[#eee4d5]">
              <h3 className="text-base font-bold text-[#1f1d1b]">
                {actionType === 'verify'
                  ? 'Confirm Payment Verification'
                  : actionType === 'reject'
                  ? 'Reject Payment Claim'
                  : 'Payment Details'}
              </h3>
              <button
                onClick={() => {
                  setSelectedPayment(null);
                  setActionType(null);
                }}
                className="w-7 h-7 rounded-full bg-[#fbf6ee] flex items-center justify-center text-[#746e67]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="bg-[#fbf6ee] p-4 rounded-2xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#746e67]">Order:</span>
                <strong className="text-[#1f1d1b]">{selectedPayment.orderNumber || selectedPayment.orderId}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#746e67]">Payment Ref:</span>
                <strong className="text-[#ae002a]">{selectedPayment.paymentReference}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#746e67]">Amount:</span>
                <strong className="text-[#ae002a] text-sm">{formatCurrency(selectedPayment.amount, selectedPayment.currency || 'TZS')}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#746e67]">Claimed Txn ID:</span>
                <strong className="text-[#1f1d1b] font-mono">{selectedPayment.transactionId || 'None'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#746e67]">Customer Phone:</span>
                <strong className="text-[#1f1d1b]">{selectedPayment.customerPhone || selectedPayment.senderPhone || 'N/A'}</strong>
              </div>
            </div>

            {actionType === 'verify' && (
              <div className="space-y-3">
                <p className="text-xs text-[#554e46]">
                  By clicking <strong>Verify &amp; Confirm</strong>, the order will immediately be marked as <strong>PAID</strong> and dispatched to the <strong>Kitchen Display System (KDS)</strong>.
                </p>
                <input
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  placeholder="Optional verification note (e.g., M-Pesa SMS confirmed)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#ebdccb] text-xs focus:outline-none focus:border-[#ae002a]"
                />
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      setSelectedPayment(null);
                      setActionType(null);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-[#fbf6ee] text-[#554e46] font-bold text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleVerify(selectedPayment.paymentReference)}
                    disabled={actionLoading}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 shadow-md"
                  >
                    {actionLoading ? 'Verifying...' : 'Verify & Confirm'}
                  </button>
                </div>
              </div>
            )}

            {actionType === 'reject' && (
              <div className="space-y-3">
                <p className="text-xs text-rose-700 font-bold">
                  Rejecting this payment will keep the order unconfirmed and mark payment as FAILED.
                </p>
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason (e.g. Transaction ID not found in bank SMS)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#ebdccb] text-xs focus:outline-none focus:border-[#ae002a]"
                />
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      setSelectedPayment(null);
                      setActionType(null);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-[#fbf6ee] text-[#554e46] font-bold text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleReject(selectedPayment.paymentReference)}
                    disabled={actionLoading}
                    className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 shadow-md"
                  >
                    {actionLoading ? 'Rejecting...' : 'Reject Payment'}
                  </button>
                </div>
              </div>
            )}

            {actionType === 'view' && (
              <div className="pt-2">
                <button
                  onClick={() => {
                    setSelectedPayment(null);
                    setActionType(null);
                  }}
                  className="w-full py-2.5 rounded-xl bg-[#1f1d1b] text-white font-bold text-xs"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
