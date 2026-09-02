import { useState, useEffect } from 'react';
import { X, Utensils, ShoppingBag, Truck } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import useCartStore from '../../store/useCartStore';

const orderTypes = [
  { id: 'dine-in', label: 'Dine In', icon: Utensils, desc: 'Eat at the restaurant' },
  { id: 'takeout', label: 'Takeout', icon: ShoppingBag, desc: 'Pick up to go' },
  { id: 'delivery', label: 'Delivery', icon: Truck, desc: 'Deliver to address' },
];

export default function OrderTypeSelector({ isOpen, onClose, onComplete }) {
  const [selectedType, setSelectedType] = useState('dine-in');
  const [localTable, setLocalTable] = useState('');
  const [localName, setLocalName] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [source, setSource] = useState('foh');
  const [validationMessage, setValidationMessage] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const { setOrderType, setTableNumber, setCustomerName, setDeliveryAddress: saveDeliveryAddress, setOrderSource, setPaymentReference } = useCartStore();

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (selectedType === 'dine-in' && (!localTable || Number(localTable) < 1)) {
      setValidationMessage('Enter a valid table number to continue.');
      return;
    }
    if (selectedType === 'delivery' && (!localName || !deliveryAddress)) {
      setValidationMessage('Enter the customer name and delivery address to continue.');
      return;
    }
    setValidationMessage('');
    setOrderType(selectedType);
    setTableNumber(selectedType === 'dine-in' ? localTable : null);
    setCustomerName(localName || '');
    setDeliveryAddress(selectedType === 'delivery' ? deliveryAddress : '');
    setOrderSource(source);
    setPaymentReference('');
    
    setIsClosing(true);
    setTimeout(() => {
      onComplete(selectedType, localTable);
      setIsClosing(false);
    }, 420);
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}>
      <div className={`fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`} onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-elevated w-full max-w-md ${isClosing ? 'animate-slide-down' : 'animate-slide-up'}`}>
        <div className="p-5 border-b border-outline-variant flex items-center justify-between">
          <h2 className="text-lg font-display font-bold">Order Type</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {orderTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => { setSelectedType(type.id); setValidationMessage(''); }}
                className={
                  'p-4 rounded-xl text-center transition-all border-2 ' +
                  (selectedType === type.id
                    ? 'border-primary bg-primary/5'
                    : 'border-outline-variant hover:border-outline')
                }
              >
                <type.icon size={24} className={'mx-auto mb-2 ' + (selectedType === type.id ? 'text-primary' : 'text-surface-on-variant')} />
                <p className="text-sm font-bold">{type.label}</p>
                <p className="text-xs text-surface-on-variant mt-0.5">{type.desc}</p>
              </button>
            ))}
          </div>

          {selectedType === 'dine-in' && (
            <Input label="Table Number" type="number" min="1" placeholder="e.g. 5" value={localTable} onChange={(e) => { setLocalTable(e.target.value); setValidationMessage(''); }} required />
          )}
          <div><label className="block text-xs font-semibold text-surface-on-variant uppercase mb-1.5">Order source</label><select className="input-field" value={source} onChange={(e) => setSource(e.target.value)}><option value="foh">FOH / Walk-in</option><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option></select></div>
          {selectedType === 'delivery' && (
            <>
              <Input label="Customer Name" placeholder="Full name" value={localName} onChange={(e) => setLocalName(e.target.value)} required />
              <Input label="Delivery Address" placeholder="Street address" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} required />
            </>
          )}
          {selectedType === 'takeout' && (
            <Input label="Customer Name (Optional)" placeholder="Walk-in customer" value={localName} onChange={(e) => setLocalName(e.target.value)} />
          )}
          {validationMessage && <p className="text-sm text-primary" role="alert">{validationMessage}</p>}
        </div>

        <div className="p-5 border-t border-outline-variant">
          <Button
            onClick={handleConfirm}
            className="w-full"
            size="lg"
            disabled={(selectedType === 'dine-in' && (!localTable || Number(localTable) < 1)) || (selectedType === 'delivery' && (!localName || !deliveryAddress))}
          >
            Continue to Payment
          </Button>
        </div>
      </div>
    </div>
  );
}
