import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle, Receipt, ArrowRight } from 'lucide-react';
import { formatCurrency, printReceipt } from '../../utils/format';
import Button from '../../components/ui/Button';

export default function PaymentSuccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { order, orderId, total, method, awaitingConfirmation } = location.state || {};

  if (!orderId && !order) {
    return (
      <div className="payment-page min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-surface-on-variant mb-4">No payment record found.</p>
          <Button onClick={() => navigate('/pos')}>Back to POS</Button>
        </div>
      </div>
    );
  }

  const receiptOrder = order || { id: orderId, total, paymentMethod: method, items: [] };

  return (
    <div className="payment-page min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center animate-bounce-in">
        <div className="success-orbit w-24 h-24 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={56} className="text-success" />
        </div>
        <h1 className="text-2xl font-display font-bold mb-2">{awaitingConfirmation ? 'Payment Submitted' : 'Payment Successful!'}</h1>
        <p className="text-surface-on-variant mb-6">{awaitingConfirmation ? 'The kitchen will confirm your Lipa Namba payment before preparing the order.' : 'Transaction completed successfully'}</p>

        <div className="card text-left mb-6">
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-surface-on-variant">Order ID</span>
              <span className="font-bold">{orderId || receiptOrder.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-surface-on-variant">Amount Paid</span>
              <span className="font-bold text-primary text-lg">{formatCurrency(total ?? receiptOrder.total ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-surface-on-variant">Payment Method</span>
              <span className="font-semibold capitalize">{method || receiptOrder.paymentMethod || 'card'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-surface-on-variant">Time</span>
              <span className="font-semibold">{new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => navigate('/pos')} className="flex-1" size="lg">
            New Order
          </Button>
          <Button onClick={() => printReceipt(receiptOrder)} className="flex-1" size="lg">
            <Receipt size={16} /> Receipt
          </Button>
        </div>
      </div>
    </div>
  );
}
