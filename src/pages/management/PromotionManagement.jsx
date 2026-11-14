import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { formatCurrency } from '../../utils/format';

const emptyOffer = {
  id: '',
  name: '',
  code: '',
  discountType: 'percentage',
  discountValue: '',
  minimumSubtotal: '0',
  eligibleMenuItemIds: [],
  qualifyingQuantity: '2',
  rewardQuantity: '1',
  startsAt: '',
  endsAt: '',
  maxUses: '',
  active: true,
};

function localDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function PromotionManagement() {
  const [offers, setOffers] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [form, setForm] = useState(emptyOffer);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [offerRows, menuRows] = await Promise.all([api.getOffers(), api.getMenu(true)]);
      setOffers(offerRows);
      setMenuItems(Array.isArray(menuRows) ? menuRows : []);
    } catch (loadError) {
      setError(loadError.message || 'Unable to load offers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const editOffer = (offer) => setForm({
    ...offer,
    discountValue: String(offer.discountValue || ''),
    minimumSubtotal: String(offer.minimumSubtotal || 0),
    qualifyingQuantity: String(offer.qualifyingQuantity || 2),
    rewardQuantity: String(offer.rewardQuantity || 1),
    maxUses: offer.maxUses === '' ? '' : String(offer.maxUses),
    startsAt: localDateTime(offer.startsAt),
    endsAt: localDateTime(offer.endsAt),
  });

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const data = {
      ...form,
      discountValue: Number(form.discountValue || 0),
      minimumSubtotal: Number(form.minimumSubtotal || 0),
      qualifyingQuantity: Number(form.qualifyingQuantity),
      rewardQuantity: Number(form.rewardQuantity),
      maxUses: form.maxUses === '' ? null : Number(form.maxUses),
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    };
    try {
      if (form.id) await api.updateOffer(form.id, data);
      else await api.createOffer(data);
      setForm(emptyOffer);
      setNotice('Offer saved. A manager must approve it when applying it to an order.');
      await load();
    } catch (saveError) {
      setError(saveError.message || 'Unable to save offer.');
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = (id) => setForm((current) => {
    const selected = current.eligibleMenuItemIds.map(Number);
    return {
      ...current,
      eligibleMenuItemIds: selected.includes(Number(id))
        ? selected.filter((itemId) => itemId !== Number(id))
        : [...selected, Number(id)],
    };
  });

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      <form onSubmit={save} className="space-y-4 rounded-xl border border-outline-variant p-4">
        <div>
          <h3 className="font-display font-bold">{form.id ? 'Edit offer' : 'Create offer'}</h3>
          <p className="text-xs text-surface-on-variant">Offers are validated on the server and cannot exceed their configured limits.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Offer name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <Input label="Optional code" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
          <label className="text-xs font-semibold">Offer type
            <select className="input-field mt-1" value={form.discountType} onChange={(event) => setForm({ ...form, discountType: event.target.value })}>
              <option value="percentage">Percentage off</option>
              <option value="fixed">Fixed amount off</option>
              <option value="buy_x_get_y">Buy X, get Y free</option>
            </select>
          </label>
          {form.discountType !== 'buy_x_get_y' ? <Input label={form.discountType === 'percentage' ? 'Discount percent' : 'Discount amount (TZS)'} type="number" min="0.01" max={form.discountType === 'percentage' ? '100' : undefined} step="any" required value={form.discountValue} onChange={(event) => setForm({ ...form, discountValue: event.target.value })} /> : <>
            <Input label="Qualifying quantity (buy)" type="number" min="1" step="1" value={form.qualifyingQuantity} onChange={(event) => setForm({ ...form, qualifyingQuantity: event.target.value })} />
            <Input label="Reward quantity (free)" type="number" min="1" step="1" value={form.rewardQuantity} onChange={(event) => setForm({ ...form, rewardQuantity: event.target.value })} />
          </>}
          <Input label="Minimum order subtotal (TZS)" type="number" min="0" step="1" value={form.minimumSubtotal} onChange={(event) => setForm({ ...form, minimumSubtotal: event.target.value })} />
          <Input label="Maximum uses (blank = unlimited)" type="number" min="1" step="1" value={form.maxUses} onChange={(event) => setForm({ ...form, maxUses: event.target.value })} />
          <Input label="Starts at" type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
          <Input label="Ends at" type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} />
        </div>
        <fieldset className="max-h-48 overflow-y-auto rounded-lg border border-outline-variant p-3">
          <legend className="px-1 text-xs font-semibold">Eligible items <span className="font-normal text-surface-on-variant">(none selected means all items)</span></legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {menuItems.map((item) => <label key={item.id} className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.eligibleMenuItemIds.map(Number).includes(Number(item.id))} onChange={() => toggleItem(item.id)} />
              {item.name} · {formatCurrency(item.price)}
            </label>)}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Offer active</label>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : form.id ? 'Update offer' : 'Create offer'}</Button>
          {form.id && <Button type="button" variant="ghost" onClick={() => setForm(emptyOffer)}>Cancel edit</Button>}
        </div>
      </form>

      <div className="space-y-2">
        <h3 className="font-display font-bold">Configured offers</h3>
        {loading ? <p className="text-sm text-surface-on-variant">Loading offers…</p> : offers.map((offer) => (
          <div key={offer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant p-3">
            <div><p className="font-semibold">{offer.name} {!offer.active && <span className="text-xs text-error">(inactive)</span>}</p>
              <p className="text-xs text-surface-on-variant">{offer.discountType === 'percentage' ? `${offer.discountValue}% off` : offer.discountType === 'fixed' ? `${formatCurrency(offer.discountValue)} off` : `Buy ${offer.qualifyingQuantity}, get ${offer.rewardQuantity}`} · {offer.useCount}{offer.maxUses ? `/${offer.maxUses}` : ''} uses</p></div>
            <Button type="button" size="sm" variant="secondary" onClick={() => editOffer(offer)}>Edit</Button>
          </div>
        ))}
        {!loading && !offers.length && <p className="text-sm text-surface-on-variant">No offers created.</p>}
      </div>
    </div>
  );
}
