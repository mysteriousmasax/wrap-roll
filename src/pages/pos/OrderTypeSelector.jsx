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

function localDateTimeValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function OrderTypeSelector({ isOpen, onClose, onComplete }) {
  const [selectedType, setSelectedType] = useState('dine-in');
  const [localTable, setLocalTable] = useState('');
  const [localName, setLocalName] = useState('');
  const [localPhone, setLocalPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryLatitude, setDeliveryLatitude] = useState(null);
  const [deliveryLongitude, setDeliveryLongitude] = useState(null);
  const [source, setSource] = useState('foh');
  const [fulfillmentMode, setFulfillmentMode] = useState('standard');
  const [scheduledFor, setScheduledFor] = useState('');
  const [validationMessage, setValidationMessage] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const { setOrderType, setTableNumber, setCustomerName, setCustomerPhone, setDeliveryLocation, setOrderSource, setPaymentReference, setFulfillmentMode: saveFulfillmentMode, setScheduledFor: saveScheduledFor } = useCartStore();

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (selectedType === 'dine-in' && fulfillmentMode !== 'roadside_handoff' && (!localTable || Number(localTable) < 1)) {
      setValidationMessage('Enter a valid table number to continue.');
      return;
    }
    if (selectedType === 'delivery' && (!localName || (!deliveryAddress && fulfillmentMode !== 'roadside_handoff'))) {
      setValidationMessage('Enter the customer name and delivery address to continue.');
      return;
    }
    if (fulfillmentMode === 'roadside_handoff' && (!localName.trim() || !localPhone.trim())) {
      setValidationMessage('Enter the customer name and phone number for roadside handoff updates.');
      return;
    }
    if (source === 'whatsapp' && !localPhone.trim()) {
      setValidationMessage('Enter the WhatsApp number to continue.');
      return;
    }
    setValidationMessage('');
    const nextOrderType = fulfillmentMode === 'roadside_handoff' ? 'takeout' : selectedType;
    setOrderType(nextOrderType);
    setTableNumber(nextOrderType === 'dine-in' ? localTable : null);
    setCustomerName(localName || '');
    setCustomerPhone(localPhone.trim());
    setDeliveryLocation({
      address: selectedType === 'delivery' ? deliveryAddress : '',
      latitude: selectedType === 'delivery' ? deliveryLatitude : null,
      longitude: selectedType === 'delivery' ? deliveryLongitude : null,
    });
    setOrderSource(source);
    setPaymentReference('');
    saveFulfillmentMode(fulfillmentMode);
    saveScheduledFor(scheduledFor ? new Date(scheduledFor).toISOString() : '');
    
    setIsClosing(true);
    setTimeout(() => {
      onComplete(nextOrderType, localTable);
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

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-surface-on-variant">Fulfillment</label>
            <select value={fulfillmentMode} onChange={(event) => { setFulfillmentMode(event.target.value); setValidationMessage(''); }} className="input-field">
              <option value="standard">Standard service</option>
              <option value="roadside_handoff">Roadside handoff · Mwai Kibaki Road</option>
            </select>
          </div>
          <Input label="Pickup / handoff time (optional)" type="datetime-local" min={localDateTimeValue(new Date(Date.now() + 5 * 60 * 1000))} value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} />

          {selectedType === 'dine-in' && fulfillmentMode !== 'roadside_handoff' && (
            <Input label="Table Number" type="number" min="1" placeholder="e.g. 5" value={localTable} onChange={(e) => { setLocalTable(e.target.value); setValidationMessage(''); }} required />
          )}
          <div><label className="block text-xs font-semibold text-surface-on-variant uppercase mb-1.5">Order source</label><select className="input-field" value={source} onChange={(e) => { setSource(e.target.value); setValidationMessage(''); }}><option value="foh">FOH / Walk-in</option><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option></select></div>
          {source === 'whatsapp' && (
            <Input label="WhatsApp Number" type="tel" placeholder="e.g. 0712 345 678" value={localPhone} onChange={(e) => { setLocalPhone(e.target.value); setValidationMessage(''); }} required />
          )}
          {selectedType === 'delivery' && fulfillmentMode !== 'roadside_handoff' && (
            <>
              <Input label="Customer Name" placeholder="Full name" value={localName} onChange={(e) => setLocalName(e.target.value)} required />
              <div><label className="mb-1.5 block text-xs font-semibold uppercase text-surface-on-variant">Drop-off location</label><DeliveryLocationPicker value={deliveryAddress} latitude={deliveryLatitude} longitude={deliveryLongitude} onChange={({ address, latitude, longitude }) => { setDeliveryAddress(address); setDeliveryLatitude(latitude); setDeliveryLongitude(longitude); setValidationMessage(''); }} /></div>
            </>
          )}
          {(selectedType === 'takeout' || fulfillmentMode === 'roadside_handoff') && (
            <Input label={fulfillmentMode === 'roadside_handoff' ? 'Customer Name' : 'Customer Name (Optional)'} placeholder="Full name" value={localName} onChange={(e) => setLocalName(e.target.value)} required={fulfillmentMode === 'roadside_handoff'} />
          )}
          {fulfillmentMode === 'roadside_handoff' && <Input label="Customer Phone" type="tel" placeholder="+255 7XX XXX XXX" value={localPhone} onChange={(event) => { setLocalPhone(event.target.value); setValidationMessage(''); }} required />}
          {validationMessage && <p className="text-sm text-primary" role="alert">{validationMessage}</p>}
        </div>

        <div className="shrink-0 border-t border-outline-variant bg-white p-5">
          <Button
            onClick={handleConfirm}
            className="w-full"
            size="lg"
            disabled={(selectedType === 'dine-in' && fulfillmentMode !== 'roadside_handoff' && (!localTable || Number(localTable) < 1)) || (selectedType === 'delivery' && (!localName || (!deliveryAddress && fulfillmentMode !== 'roadside_handoff'))) || (fulfillmentMode === 'roadside_handoff' && (!localName.trim() || !localPhone.trim())) || (source === 'whatsapp' && !localPhone.trim())}
          >
            Continue to Payment
          </Button>
        </div>
      </div>
    </div>
  );
}
