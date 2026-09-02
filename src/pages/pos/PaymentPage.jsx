import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Smartphone, Banknote, QrCode, AlertCircle, CheckCircle } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import PaymentClient from '../../api/paymentClient';
import useCartStore from '../../store/useCartStore';
import useOrderStore from '../../store/useOrderStore';
import useSettingsStore from '../../store/useSettingsStore';
import Button from '../../components/ui/Button';

const PAYMENT_METHOD_ICONS = {
  tigo_pesa: Smartphone,
  airtel_money: Smartphone,
  mpesa: Smartphone,
  bank_transfer: CreditCard,
  equity_bank: CreditCard,
};

export default function PaymentPage() {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentId, setPaymentId] = useState(null);
  const [pollStatus, setPollStatus] = useState('waiting');

  const { items, getSubtotal, getTax, getTotal, orderType, tableNumber, customerName, deliveryAddress, orderSource, clearCart } = useCartStore();
  const createOrder = useOrderStore((s) => s.createOrder);
  const taxRate = useSettingsStore((s) => s.settings.tax_rate);
  const navigate = useNavigate();

  // Load available payment methods
  useEffect(() => {
    const loadPaymentMethods = async () => {
      try {
        const methods = await PaymentClient.getPaymentMethods();
        setPaymentMethods(methods);
        setLoading(false);
      } catch (err) {
        setError('Failed to load payment methods');
        setLoading(false);
      }
    };

    loadPaymentMethods();
  }, []);

  // Poll payment status
  useEffect(() => {
    if (!paymentId || pollStatus === 'completed') return;

    const pollInterval = setInterval(async () => {
      try {
        const status = await PaymentClient.checkPaymentStatus(paymentId);
        
        if (status.status === 'completed' || status.status === 'paid') {
          setPollStatus('completed');
          clearInterval(pollInterval);
          
          // Complete the order
          setTimeout(() => {
            navigate('/pos/success', {
              state: {
                orderId: status.orderId,
                total: status.amount,
                method: status.paymentMethod,
                paymentId: paymentId,
              },
            });
          }, 1500);
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [paymentId, pollStatus, navigate, clearCart]);

  const handlePayment = async () => {
    if (!selectedMethod) {
      setError('Please select a payment method');
      return;
    }

    if (!customerEmail) {
      setError('Email address is required');
      return;
    }

    if (!customerPhone) {
      setError('Phone number is required');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      // Create order first
      const order = await createOrder({
        items: items.map((i) => ({
          menuItemId: i.id,
          name: i.name,
          qty: i.quantity,
          price: i.price,
          modifiers: i.modifiers,
          specialInstructions: i.specialInstructions,
        })),
        subtotal: getSubtotal(),
        tax: getTax(),
        total: getTotal(),
        orderType,
        tableNumber: tableNumber ? Number(tableNumber) : null,
        customerName: customerName || 'Guest',
        customerPhone,
        customerEmail,
        deliveryAddress: deliveryAddress || null,
        paymentMethod: selectedMethod,
        orderSource,
      });

      // Initiate payment
      const paymentResponse = await PaymentClient.initiatePayment({
        orderId: order.id,
        amount: order.total,
        currency: 'TZS',
        description: `Order ${order.id} - Wrap & Roll`,
        customerEmail,
        customerPhone,
        paymentMethod: selectedMethod,
      });

      setPaymentId(paymentResponse.paymentId);
      setPollStatus('waiting');

      // For development/testing, redirect to Pesapal
      if (paymentResponse.redirectUrl) {
        // Open Pesapal payment page in a new tab or modal
        window.open(paymentResponse.redirectUrl, '_blank');
      }
    } catch (err) {
      setError(err.message || 'Payment failed. Please try again.');
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="payment-page min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="payment-panel bg-white rounded-2xl shadow-elevated p-8 max-w-md w-full text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-surface-on-variant">Loading payment methods...</p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    navigate('/pos', { replace: true });
    return null;
  }

  // Payment processing/confirmation state
  if (pollStatus === 'waiting' || pollStatus === 'completed') {
    return (
      <div className="payment-page min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="payment-panel bg-white rounded-2xl shadow-elevated p-8 max-w-md w-full text-center animate-slide-up">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
            pollStatus === 'completed' ? 'bg-green-100' : 'bg-blue-100'
          }`}>
            {pollStatus === 'completed' ? (
              <CheckCircle size={32} className="text-green-600" />
            ) : (
              <QrCode size={32} className="text-blue-600" />
            )}
          </div>
          <h2 className="text-xl font-display font-bold mb-2">
            {pollStatus === 'completed' ? 'Payment Confirmed!' : 'Processing Payment'}
          </h2>
          <p className="text-sm text-surface-on-variant mb-2">
            {pollStatus === 'completed'
              ? 'Your payment has been processed successfully.'
              : 'Please complete payment on the Pesapal page.'}
          </p>
          <p className="text-2xl font-display font-bold text-primary mb-4">
            {formatCurrency(getTotal())}
          </p>
          {pollStatus === 'waiting' && (
            <div className="space-y-2">
              <p className="text-xs text-surface-on-variant">Waiting for payment confirmation...</p>
              <div className="w-full h-1 bg-surface-container-low rounded-full overflow-hidden">
                <div className="h-full bg-primary animate-pulse"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="payment-page min-h-screen bg-surface">
      <div className="max-w-2xl mx-auto p-6">
        <button
          onClick={() => navigate('/pos')}
          className="flex items-center gap-2 text-sm text-surface-on-variant hover:text-surface-on mb-6"
        >
          <ArrowLeft size={16} /> Back to POS
        </button>

        <div className="mb-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Secure Checkout</p>
          <h1 className="mt-1 text-2xl font-display font-bold">Complete Payment</h1>
          <p className="mt-1 text-sm text-surface-on-variant">Choose your payment method and enter your details</p>
        </div>

        <div className="card mb-6">
          <h3 className="font-bold text-sm mb-3">Order Summary</h3>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.cartId} className="flex justify-between text-sm">
                <span>{item.quantity}x {item.name}</span>
                <span className="font-semibold">{formatCurrency(item.price * item.quantity)}</span>
              </div>
            ))}
            <div className="border-t border-outline-variant pt-2 mt-2 space-y-1">
              <div className="flex justify-between text-sm text-surface-on-variant">
                <span>Subtotal</span>
                <span>{formatCurrency(getSubtotal())}</span>
              </div>
              <div className="flex justify-between text-sm text-surface-on-variant">
                <span>Tax ({taxRate}%)</span>
                <span>{formatCurrency(getTax())}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-1">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(getTotal())}</span>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="card bg-red-50 border border-red-200 mb-6 flex items-start gap-3">
            <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-red-900">Error</h4>
              <p className="text-sm text-red-800 mt-1">{error}</p>
            </div>
          </div>
        )}

        <div className="card mb-6">
          <h3 className="font-bold text-sm mb-4">Customer Information</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-surface-on-variant mb-1">Email Address *</label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="customer@example.com"
                className="w-full px-3 py-2 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-surface-on-variant mb-1">Phone Number *</label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+255 700 000 000"
                className="w-full px-3 py-2 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="font-bold text-sm mb-3">Payment Methods</h3>
          <div className="space-y-2">
            {paymentMethods.length === 0 ? (
              <div className="card bg-yellow-50 border border-yellow-200">
                <p className="text-sm text-yellow-800">No payment methods available. Please contact support.</p>
              </div>
            ) : (
              paymentMethods.map((method) => {
                const IconComponent = PAYMENT_METHOD_ICONS[method.id] || CreditCard;
                return (
                  <button
                    key={method.id}
                    onClick={() => setSelectedMethod(method.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                      selectedMethod === method.id
                        ? 'border-primary bg-primary-container/10'
                        : 'border-outline-variant bg-white hover:border-primary/50'
                    }`}
                  >
                    <IconComponent size={24} className={selectedMethod === method.id ? 'text-primary' : 'text-surface-on-variant'} />
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{method.label}</p>
                      <p className="text-xs text-surface-on-variant">{method.description}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedMethod === method.id
                        ? 'border-primary bg-primary'
                        : 'border-outline-variant'
                    }`}>
                      {selectedMethod === method.id && (
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => navigate('/pos')}
            className="flex-1"
            disabled={processing}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePayment}
            disabled={processing || !selectedMethod || !customerEmail || !customerPhone}
            className="flex-1"
          >
            {processing ? 'Processing...' : `Pay ${formatCurrency(getTotal())}`}
          </Button>
        </div>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-900">
            <strong>🔒 Secure Payment:</strong> All payments are processed securely through Pesapal. Your payment information is encrypted and never stored on our servers.
          </p>
        </div>
      </div>
    </div>
  );
}
/*
    }
  };

  if (items.length === 0 && !processing) {
    navigate('/pos', { replace: true });
    return null;
  }

  if (showQR) {
    return (
      <div className="payment-page min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="payment-panel bg-white rounded-2xl shadow-elevated p-8 max-w-md w-full text-center animate-slide-up">
          <div className="w-16 h-16 rounded-full bg-secondary-container/30 flex items-center justify-center mx-auto mb-4">
            <QrCode size={32} className="text-secondary" />
          </div>
          <h2 className="text-xl font-display font-bold mb-2">Lipa Namba QR Payment</h2>
          <p className="text-sm text-surface-on-variant mb-6">Scan this QR code with your mobile money app</p>

          <div className="w-48 h-48 mx-auto bg-surface-container-low rounded-xl flex items-center justify-center mb-6 border-2 border-outline-variant">
            <div className="w-40 h-40 bg-white rounded-lg grid grid-cols-8 grid-rows-8 gap-0.5 p-2">
              {qrPattern.map((filled, i) => (
                <div key={i} className={'rounded-sm ' + (filled ? 'bg-surface-on' : 'bg-white')} />
              ))}
            </div>
          </div>

          <p className="text-2xl font-display font-bold text-primary mb-2">{formatCurrency(getTotal())}</p>
          <p className="text-xs text-surface-on-variant mb-6">Waiting for payment confirmation...</p>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setShowQR(false)} className="flex-1">Back</Button>
            <Button onClick={processPayment} disabled={processing} className="flex-1">
              {processing ? 'Processing...' : 'Simulate Payment'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-page min-h-screen bg-surface">
      <div className="max-w-2xl mx-auto p-6">
        <button onClick={() => navigate('/pos')} className="flex items-center gap-2 text-sm text-surface-on-variant hover:text-surface-on mb-6">
          <ArrowLeft size={16} /> Back to POS
        </button>

        <div className="mb-6"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">FOH checkout</p><h1 className="mt-1 text-2xl font-display font-bold">Select Payment Method</h1><p className="mt-1 text-sm text-surface-on-variant">Confirm the order total, then choose how the guest will pay.</p></div>

        <div className="card mb-6">
          <h3 className="font-bold text-sm mb-3">Order Summary</h3>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.cartId} className="flex justify-between text-sm">
                <span>{item.quantity}x {item.name}</span>
                <span className="font-semibold">{formatCurrency(item.price * item.quantity)}</span>
              </div>
            ))}
            <div className="border-t border-outline-variant pt-2 mt-2 space-y-1">
              <div className="flex justify-between text-sm text-surface-on-variant"><span>Subtotal</span><span>{formatCurrency(getSubtotal())}</span></div>
              <div className="flex justify-between text-sm text-surface-on-variant"><span>Tax ({taxRate}%)</span><span>{formatCurrency(getTax())}</span></div>
              <div className="flex justify-between font-bold text-lg pt-1"><span>Total</span><span className="text-primary">{formatCurrency(getTotal())}</span></div>
            </div>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          {paymentMethods.map((method) => (
            <button
              key={method.id}
              onClick={() => setSelectedMethod(method.id)}
              className={
                'w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ' +
                (selectedMethod === method.id
                  ? 'border-primary bg-primary/5'
                  : 'border-outline-variant bg-white hover:border-outline')
              }
            >
              <div className={
                'w-12 h-12 rounded-xl flex items-center justify-center ' +
                (selectedMethod === method.id ? 'bg-primary text-white' : 'bg-surface-container-low text-surface-on')
              }>
                <method.icon size={22} />
              </div>
              <div>
                <p className="font-display font-bold text-sm">{method.label}</p>
                <p className="text-xs text-surface-on-variant">{method.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {selectedMethod === 'mobile' && <input className="input-field mb-4" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Lipa Namba payment reference" required />}

        {error && <p className="text-error text-sm mb-4">{error}</p>}

        <Button onClick={handlePayment} disabled={!selectedMethod || processing} size="lg" className="w-full">
          {processing ? 'Processing...' : 'Pay ' + formatCurrency(getTotal())}
        </Button>
      </div>
    </div>
  );
}
*/
