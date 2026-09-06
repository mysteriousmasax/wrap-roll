import { useState, useEffect } from 'react';
import { X, Utensils, ShoppingBag, Truck } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import useCartStore from '../../store/useCartStore';
import DeliveryLocationPicker from './DeliveryLocationPicker';

const orderTypes = [
  { id: 'dine-in', label: 'Dine In', icon: Utensils, desc: 'Eat at the restaurant' },
  { id: 'takeout', label: 'Takeout', icon: ShoppingBag, desc: 'Pick up to go' },
  { id: 'delivery', label: 'Delivery', icon: Truck, desc: 'Deliver to address' },
];

export default function OrderTypeSelector({ isOpen, onClose, onComplete }) {
  const [selectedType, setSelectedType] = useState('dine-in');
  const [localTable, setLocalTable] = useState('');
  const [localName, setLocalName] = useState('');
  const [localPhone, setLocalPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryLatitude, setDeliveryLatitude] = useState(null);
  const [deliveryLongitude, setDeliveryLongitude] = useState(null);
  const [source, setSource] = useState('foh');
  const [validationMessage, setValidationMessage] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const { setOrderType, setTableNumber, setCustomerName, setCustomerPhone, setDeliveryLocation, setOrderSource, setPaymentReference } = useCartStore();

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
    if (source === 'whatsapp' && !localPhone.trim()) {
      setValidationMessage('Enter the WhatsApp number to continue.');
      return;
    }
    setValidationMessage('');
    setOrderType(selectedType);
    setTableNumber(selectedType === 'dine-in' ? localTable : null);
    setCustomerName(localName || '');
    setCustomerPhone(localPhone.trim());
    setDeliveryLocation({
      address: selectedType === 'delivery' ? deliveryAddress : '',
      latitude: selectedType === 'delivery' ? deliveryLatitude : null,
      longitude: selectedType === 'delivery' ? deliveryLongitude : null,
    });
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
      <div className={`relative flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-elevated ${isClosing ? 'animate-slide-down' : 'animate-slide-up'}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-outline-variant p-5">
          <h2 className="text-lg font-display font-bold">Order Type</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
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
          <div><label className="block text-xs font-semibold text-surface-on-variant uppercase mb-1.5">Order source</label><select className="input-field" value={source} onChange={(e) => { setSource(e.target.value); setValidationMessage(''); }}><option value="foh">FOH / Walk-in</option><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option></select></div>
          {source === 'whatsapp' && (
            <Input label="WhatsApp Number" type="tel" placeholder="e.g. 0712 345 678" value={localPhone} onChange={(e) => { setLocalPhone(e.target.value); setValidationMessage(''); }} required />
          )}
          {selectedType === 'delivery' && (
            <>
              <Input label="Customer Name" placeholder="Full name" value={localName} onChange={(e) => setLocalName(e.target.value)} required />
              <div><label className="mb-1.5 block text-xs font-semibold uppercase text-surface-on-variant">Drop-off location</label><DeliveryLocationPicker value={deliveryAddress} latitude={deliveryLatitude} longitude={deliveryLongitude} onChange={({ address, latitude, longitude }) => { setDeliveryAddress(address); setDeliveryLatitude(latitude); setDeliveryLongitude(longitude); setValidationMessage(''); }} /></div>
            </>
          )}
          {selectedType === 'takeout' && (
            <Input label="Customer Name (Optional)" placeholder="Walk-in customer" value={localName} onChange={(e) => setLocalName(e.target.value)} />
          )}
          {validationMessage && <p className="text-sm text-primary" role="alert">{validationMessage}</p>}
        </div>

        <div className="shrink-0 border-t border-outline-variant bg-white p-5">
          <Button
            onClick={handleConfirm}
            className="w-full"
            size="lg"
            disabled={(selectedType === 'dine-in' && (!localTable || Number(localTable) < 1)) || (selectedType === 'delivery' && (!localName || !deliveryAddress)) || (source === 'whatsapp' && !localPhone.trim())}
          >
            Continue to Payment
          </Button>
        </div>
      </div>
    </div>
  );
}
