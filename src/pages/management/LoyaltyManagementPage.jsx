import { useEffect, useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { api } from '../../api/client';
import { Gift, Search, Save, Tag, Sparkles } from 'lucide-react';

export default function LoyaltyManagementPage() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const loadItems = async () => {
    try {
      const data = await api.getLoyaltyItems();
      setItems(data);
    } catch (error) {
      setStatus(error.message || 'Unable to load loyalty items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const filtered = items.filter((customer) => {
    const haystack = `${customer.name} ${customer.nfcTagCode || ''} ${customer.customerSegment || ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const updateItem = async (customerId, field, value) => {
    const customer = items.find((item) => item.id === customerId);
    if (!customer) return;

    const payload = {
      [field]: value,
      loyaltyNotes: customer.loyaltyNotes || '',
      preferredChannel: customer.preferredChannel || 'pos',
      customerSegment: customer.customerSegment || 'regular',
      nfcTagCode: customer.nfcTagCode || '',
      nfcTagType: customer.nfcTagType || 'key_holder',
    };

    try {
      await api.updateCustomerLoyalty(customerId, payload);
      setStatus('Loyalty item updated.');
      await loadItems();
    } catch (error) {
      setStatus(error.message || 'Unable to update loyalty item');
    }
  };

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading loyalty items...</div>;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Loyalty Items" subtitle="Manage first-order NFC gifts, reward kits, and customer perks" actions={
        <Button size="sm" variant="secondary" onClick={() => loadItems()}><Sparkles size={14} /> Refresh</Button>
      } />

      {status && <p className="text-sm mb-4 text-primary">{status}</p>}

      <Card className="mb-4 p-3">
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer or tag code..." className="w-full pl-9 pr-4 py-2 rounded-lg bg-white border border-outline-variant text-sm focus:outline-none focus:border-primary" />
        </div>
      </Card>

      <div className="grid gap-3">
        {filtered.map((customer) => (
          <Card key={customer.id} className="p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">
                  {customer.name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{customer.name}</p>
                  <p className="text-xs text-surface-on-variant">{customer.phone || customer.email || 'No contact'}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 md:justify-end">
                <span className="rounded-full bg-primary/10 text-primary px-2 py-1 text-[10px] font-semibold">{customer.customerSegment || 'regular'}</span>
                <span className="rounded-full bg-success/10 text-success px-2 py-1 text-[10px] font-semibold">{customer.loyaltyItems?.length || 0} item(s)</span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="block text-xs">
                <span className="text-surface-on-variant mb-1 block">NFC tag code</span>
                <input value={customer.nfcTagCode || ''} onChange={(e) => updateItem(customer.id, 'nfcTagCode', e.target.value)} className="input-field w-full" placeholder="WR-0001-123456" />
              </label>

              <label className="block text-xs">
                <span className="text-surface-on-variant mb-1 block">Tag type</span>
                <select value={customer.nfcTagType || 'key_holder'} onChange={(e) => updateItem(customer.id, 'nfcTagType', e.target.value)} className="input-field w-full">
                  <option value="key_holder">Key Holder</option>
                  <option value="engraved_card">Engraved Card</option>
                  <option value="phone_holder">Phone Holder</option>
                  <option value="premium_kit">Premium Kit</option>
                </select>
              </label>

              <label className="block text-xs">
                <span className="text-surface-on-variant mb-1 block">Preferred channel</span>
                <select value={customer.preferredChannel || 'pos'} onChange={(e) => updateItem(customer.id, 'preferredChannel', e.target.value)} className="input-field w-full">
                  <option value="pos">In-person</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                </select>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {customer.loyaltyItems?.length ? customer.loyaltyItems.map((item) => (
                <div key={item.id} className="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-[11px]">
                  <div className="flex items-center gap-2"><Tag size={12} className="text-primary" /><span className="font-semibold">{item.itemName}</span></div>
                  <p className="text-surface-on-variant mt-1">{item.itemType} &middot; {item.status}</p>
                  <p className="text-surface-on-variant">{item.itemCode || 'No code'}</p>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low px-3 py-2 text-[11px] text-surface-on-variant">
                  No loyalty item issued yet.
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
