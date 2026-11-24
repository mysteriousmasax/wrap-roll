import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import NfcTagWriter from '../../components/NfcTagWriter';
import { api } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';
import importPhoto from '../../utils/importPhoto';
import { downloadAsset } from '../../utils/downloadAsset';
import { Users, Clock, MapPin, Wifi, Camera, NotebookPen, Upload, X, Download, Banknote, Plus, QrCode } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import InternalQrCode from '../../components/ui/InternalQrCode';

const defaultTableImage = 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&h=600&fit=crop';
const emptyForm = { number: '', seats: '4', status: 'available', tagId: '', zone: 'Main Dining', imageUrl: '', reservation: '', note: '' };

function formatTableOrderTime(value) {
  if (!value) return 'Time not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Time not recorded'
    : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export default function TableManagementPage() {
  const [tables, setTables] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editTable, setEditTable] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [customNfcUrl, setCustomNfcUrl] = useState('');
  const [paymentTable, setPaymentTable] = useState(null);
  const [tabSummary, setTabSummary] = useState(null);
  const [tabPayments, setTabPayments] = useState([]);
  const [savingPayment, setSavingPayment] = useState(false);
  const [tabCustomer, setTabCustomer] = useState({ customerName: '', customerPhone: '', customerEmail: '' });
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerMessage, setCustomerMessage] = useState('');
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [showPaymentQrs, setShowPaymentQrs] = useState(false);
  const [paymentQrError, setPaymentQrError] = useState('');

  const load = () => api.getTables().then(setTables).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  useWebSocket((event) => { if (event === 'table:updated' || event === 'order:created' || event === 'order:updated') load(); });

  const handlePhotoChange = async (event) => {
    try {
      const imageUrl = await importPhoto(event.target.files?.[0]);
      setForm((current) => ({ ...current, imageUrl }));
      setError('');
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      event.target.value = '';
    }
  };

  const openAdd = () => {
    setError('');
    setForm(emptyForm);
    setShowAdd(true);
  };

  const openEdit = (table) => {
    setError('');
    setForm({
      number: String(table.number),
      seats: String(table.seats),
      status: table.status || 'available',
      tagId: table.tagId || '',
      zone: table.zone || 'Main Dining',
      imageUrl: table.imageUrl || '',
      reservation: table.reservation || '',
      note: table.note || '',
    });
    setEditTable(table);
  };

  const stats = {
    available: tables.filter((t) => t.status === 'available').length,
    occupied: tables.filter((t) => t.status === 'occupied').length,
    reserved: tables.filter((t) => t.status === 'reserved').length,
  };

  const openTabPayment = async (table) => {
    setError('');
    try {
      const tab = await api.getTableTab(table.id);
      setPaymentTable(table);
      setTabSummary(tab);
      setTabCustomer({
        customerName: tab.customerName || '',
        customerPhone: tab.customerPhone || '',
        customerEmail: tab.customerEmail || '',
      });
      setCustomerMessage('');
      setTabPayments([{ amount: String(Math.round(tab.balanceDue)), method: 'cash', transactionId: '' }]);
      setShowPaymentQrs(false);
      setPaymentQrError('');
      try {
        const settings = await api.getSettings();
        let accounts = [];
        try {
          accounts = JSON.parse(settings.lipa_namba_accounts || '[]');
        } catch {
          accounts = [];
        }
        setPaymentAccounts(Array.isArray(accounts) && accounts.length
          ? accounts.filter((account) => account?.number)
          : settings.lipa_namba_number
            ? [{ label: settings.lipa_namba_name || 'Lipa Namba', name: settings.lipa_namba_name || 'Wrap & Roll', number: settings.lipa_namba_number, useInternalQr: true }]
            : []);
      } catch (settingsError) {
        setPaymentAccounts([]);
        setPaymentQrError(settingsError.message || 'Unable to load payment QR codes.');
      }
    } catch (paymentError) {
      setError(paymentError.message || 'Unable to load this table tab.');
    }
  };

  const saveTabCustomer = async () => {
    if (!paymentTable || !tabSummary) return;
    setSavingCustomer(true);
    setCustomerMessage('');
    try {
      const updatedTab = await api.updateTableTabCustomer(paymentTable.id, tabCustomer);
      setTabSummary(updatedTab);
      setTabCustomer({
        customerName: updatedTab.customerName || '',
        customerPhone: updatedTab.customerPhone || '',
        customerEmail: updatedTab.customerEmail || '',
      });
      setCustomerMessage('Customer details saved to this table visit.');
      return updatedTab;
    } finally {
      setSavingCustomer(false);
    }
  };

  const submitTabPayments = async (event) => {
    event.preventDefault();
    if (!paymentTable) return;
    setSavingPayment(true);
    setError('');
    try {
      const detailsChanged = ['customerName', 'customerPhone', 'customerEmail'].some((key) =>
        String(tabCustomer[key] || '').trim() !== String(tabSummary[key] || '').trim()
      );
      if (detailsChanged) await saveTabCustomer();
      await api.recordTablePayments(paymentTable.id, tabPayments.map((payment) => ({
        amount: Number(payment.amount),
        method: payment.method,
        transactionId: payment.transactionId,
      })));
      setPaymentTable(null);
      setTabSummary(null);
      setTabPayments([]);
      await load();
    } catch (paymentError) {
      setError(paymentError.message || 'Unable to record table payment.');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleSave = async () => {
    setError('');
    if (!form.number || !form.seats) {
      setError('Table number and seats are required.');
      return;
    }
    const data = {
      number: parseInt(form.number, 10),
      seats: parseInt(form.seats, 10),
      status: form.status,
      tagId: form.tagId || `WR-T${form.number.toString().padStart(2, '0')}`,
      zone: form.zone || 'Main Dining',
      imageUrl: form.imageUrl || defaultTableImage,
      reservation: form.reservation || null,
      note: form.note || 'Tap NFC tag to identify the guest table',
    };
    try {
      if (editTable) {
        await api.updateTable(editTable.id, data);
        setEditTable(null);
      } else {
        await api.createTable(data);
        setShowAdd(false);
      }
      setForm(emptyForm);
      load();
    } catch (saveError) {
      setError(saveError.message || 'Unable to save table changes.');
    }
  };

  const downloadTableImage = async (table) => {
    if (!table.imageUrl) return;
    try {
      await downloadAsset(table.imageUrl, `wrap-roll-table-${table.number}`);
    } catch (downloadError) {
      setError(downloadError.message || 'Unable to download this image.');
    }
  };

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading tables...</div>;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Table Management" subtitle="Manage floor plan, NFC tagging, and live table assignments" actions={
      <Button size="sm" onClick={openAdd}>+ Add Table</Button>
      } />
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="card"><p className="text-xs font-semibold uppercase text-surface-on-variant">Available</p><p className="mt-1 text-2xl font-bold text-success">{stats.available}</p></div>
        <div className="card"><p className="text-xs font-semibold uppercase text-surface-on-variant">Occupied</p><p className="mt-1 text-2xl font-bold text-primary">{stats.occupied}</p></div>
        <div className="card"><p className="text-xs font-semibold uppercase text-surface-on-variant">Reserved</p><p className="mt-1 text-2xl font-bold text-secondary">{stats.reserved}</p></div>
      </div>

      <div className="card mb-6 space-y-3">
        <div>
          <h2 className="font-bold">NFC cards: records you can write</h2>
          <ul className="mt-2 space-y-1 text-xs text-surface-on-variant">
            <li><strong>Table menu / ordering:</strong> <code>/table/{'{tagId}'}</code> — each table card opens ordering for that table.</li>
            <li><strong>Customer loyalty / Roll Points:</strong> <code>/customer-rewards?tag={'{tagCode}'}</code> — each customer card opens that tag's public points balance.</li>
            <li><strong>Links:</strong> URL/URI, universal (unit.link) or app links, social profiles, video, search, payment, and shortcuts.</li>
            <li><strong>Other records:</strong> text, Android app package, file attachment, email, vCard contact, phone, SMS, location, and Wi-Fi network configuration.</li>
          </ul>
          <p className="mt-2 text-[11px] text-surface-on-variant">The writer stores standard NDEF records; link-based types store a URL/URI, contact uses vCard, Wi-Fi uses an NDEF Wi-Fi configuration, and files are embedded in the tag. Anyone who scans a tag can read its records, including Wi-Fi credentials or contact details. Tag capacity varies. Use Read tag to inspect contents before rewriting; rewriting replaces the tag's existing NDEF message.</p>
        </div>
        <label className="block text-xs font-semibold">Website URL<input type="url" value={customNfcUrl} onChange={(event) => setCustomNfcUrl(event.target.value)} placeholder="https://example.com/page" className="input-field mt-1 w-full" /></label>
        <NfcTagWriter url={customNfcUrl} label="Custom link" linkType="Custom public website" />
        <p className="text-[11px] text-surface-on-variant">Direct writing needs NFC-enabled Android Chrome, an HTTPS page, and a writable NDEF tag. Press Write, then hold the tag against the back of the phone.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tables.map((table) => (
          <div key={table.id} className={'card overflow-hidden border-2 transition-all hover:-translate-y-0.5 ' +
            (table.status === 'available' ? 'border-success/30 hover:border-success' :
             table.status === 'occupied' ? 'border-primary/30 hover:border-primary' :
             table.status === 'reserved' ? 'border-secondary-container/50 hover:border-secondary-container' :
             'border-outline-variant')}>
            <div className="relative h-32 w-full overflow-hidden">
              <img src={table.imageUrl || defaultTableImage} alt={`Table ${table.number}`} className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent p-3 text-white">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-white/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur-sm">{table.zone || 'Main Dining'}</span>
                  <span className="rounded-full bg-[#f5d777]/90 px-2 py-1 text-[10px] font-bold text-[#24211e]">NFC {table.tagId || `WR-T${table.number}`}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-surface-on-variant">Table {table.number}</p>
                  <h3 className="mt-1 text-xl font-display font-bold">{table.seats}-seat seating</h3>
                </div>
                <StatusBadge status={table.status} className="whitespace-nowrap" />
              </div>

              <div className="flex items-center gap-2 text-sm text-surface-on-variant"><Users size={14} /> {table.seats} guests</div>

              <div className="grid gap-2 rounded-xl bg-surface-container-low p-3 text-xs text-surface-on-variant">
                <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><Wifi size={12} /> NFC tag</span><span className="font-semibold text-on-surface">{table.tagId || `WR-T${table.number}`}</span></div>
                <div className="break-all text-[10px] text-surface-on-variant">{table.nfcUrl || `${window.location.origin}/table/${table.tagId || `WR-T${table.number}`}`}</div>
                <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><MapPin size={12} /> Zone</span><span className="font-semibold text-on-surface">{table.zone || 'Main Dining'}</span></div>
                {table.order && <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><NotebookPen size={12} /> Live order</span><span className="font-semibold text-primary">{table.order}</span></div>}
                {table.tabId && <div className="flex items-center justify-between gap-2 font-semibold text-on-surface"><span>Tab · {table.tabOrderCount} ticket{table.tabOrderCount === 1 ? '' : 's'}</span><span>{formatCurrency(table.balanceDue)} due</span></div>}
                {table.reservation && <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><Clock size={12} /> Reservation</span><span className="font-semibold text-secondary">{table.reservation}</span></div>}
              </div>

              <section className="rounded-xl border border-outline-variant bg-white p-3" aria-label={`Orders for table ${table.number}`}>
                <h4 className="text-xs font-bold text-on-surface">Ordered food items</h4>
                {table.tickets?.length ? (
                  <div className="mt-2 space-y-3">
                    {table.tickets.map((ticket) => (
                      <div key={ticket.id} className="border-t border-outline-variant/60 pt-2 first:border-0 first:pt-0">
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-surface-on-variant">
                          <span className="font-semibold text-primary">Ticket {ticket.orderNumber}</span>
                          <span className="capitalize">{ticket.status}</span>
                        </div>
                        <ul className="mt-1 space-y-0.5 text-xs text-on-surface">
                          {ticket.items?.length
                            ? ticket.items.map((item, index) => <li key={`${ticket.id}-${index}`}>{item.quantity} × {item.name}</li>)
                            : <li>No food items recorded</li>}
                        </ul>
                        <p className="mt-1 text-[10px] text-surface-on-variant">
                          {ticket.servedAt
                            ? `Served by ${ticket.servedBy || 'Staff not recorded'} · ${formatTableOrderTime(ticket.servedAt)}`
                            : `Order taken by ${ticket.orderedBy || 'Staff not recorded'} · ${formatTableOrderTime(ticket.createdAt)}`}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-surface-on-variant">No current orders for this table.</p>
                )}
              </section>

              <div className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant bg-white px-2.5 py-2 text-xs text-surface-on-variant">
                <span className="inline-flex items-center gap-1.5"><Camera size={12} /> Table view</span>
                <span className="font-semibold text-on-surface">{table.note || 'Tap NFC tag to identify guest table'}</span>
              </div>
              <div className="space-y-3">
                <NfcTagWriter url={table.nfcUrl || `${window.location.origin}/table/${table.tagId || `WR-T${table.number}`}`} label={`Table ${table.number} link`} linkType="Table menu and ordering" />
                {table.tabId && (table.balanceDue > 0
                  ? <Button size="sm" className="w-full" onClick={() => openTabPayment(table)}><Banknote size={14} className="mr-1" /> Take payment · {formatCurrency(table.balanceDue)}</Button>
                  : <p className="rounded-lg bg-success/10 px-3 py-2 text-center text-xs font-semibold text-success">Paid in full · waiting for service to finish</p>)}
                <div className="flex gap-2"><Button variant="ghost" size="sm" className="flex-1" onClick={() => openEdit(table)}>Edit Table</Button><button type="button" title="Download table image" onClick={() => downloadTableImage(table)} disabled={!table.imageUrl} className="rounded-lg border border-outline-variant px-3 text-primary hover:bg-surface-container-low disabled:opacity-30"><Download size={15} /></button></div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={Boolean(paymentTable)} onClose={() => !savingPayment && setPaymentTable(null)} title={`Table ${paymentTable?.number} · Collect payment`}>
        {paymentTable && tabSummary && <form onSubmit={submitTabPayments} className="space-y-4">
          <div className="rounded-xl bg-surface-container-low p-3 text-sm">
            <div className="flex justify-between"><span>Tab total</span><strong>{formatCurrency(tabSummary.total)}</strong></div>
            <div className="mt-1 flex justify-between"><span>Paid so far</span><strong>{formatCurrency(tabSummary.paid)}</strong></div>
            <div className="mt-2 flex justify-between border-t border-outline-variant pt-2 font-bold"><span>Balance due</span><strong className="text-primary">{formatCurrency(tabSummary.balanceDue)}</strong></div>
          </div>
          {tabSummary.tickets.map((ticket) => <div key={ticket.id} className="flex justify-between text-xs text-surface-on-variant"><span>{ticket.orderNumber} · {ticket.status}</span><span>{formatCurrency(ticket.balanceDue)} due</span></div>)}
          <section className="space-y-3 rounded-xl border border-outline-variant p-3">
            <div>
              <h3 className="text-sm font-bold">Customer details <span className="font-normal text-surface-on-variant">(optional)</span></h3>
              <p className="text-xs text-surface-on-variant">Add or update these details when the customer is ready to pay. They will be attached to all tickets on this table visit.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Name" value={tabCustomer.customerName} onChange={(event) => setTabCustomer((current) => ({ ...current, customerName: event.target.value }))} />
              <Input label="Phone" type="tel" value={tabCustomer.customerPhone} onChange={(event) => setTabCustomer((current) => ({ ...current, customerPhone: event.target.value }))} />
              <Input label="Email" type="email" value={tabCustomer.customerEmail} onChange={(event) => setTabCustomer((current) => ({ ...current, customerEmail: event.target.value }))} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" variant="secondary" disabled={savingCustomer || savingPayment} onClick={() => saveTabCustomer().catch((saveError) => setError(saveError.message || 'Unable to save customer details.'))}>
                {savingCustomer ? 'Saving details…' : 'Save customer details'}
              </Button>
              {customerMessage && <span className="text-xs font-semibold text-success" role="status">{customerMessage}</span>}
            </div>
          </section>
          {tabSummary.payments.length > 0 && <div className="space-y-1 rounded-xl border border-outline-variant p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-surface-on-variant">Payments recorded</p>
            {tabSummary.payments.map((payment) => <div key={payment.id} className="flex justify-between gap-2 text-xs"><span className="truncate">{payment.method}{payment.transactionId ? ` · ${payment.transactionId}` : ''}</span><strong className="shrink-0">{formatCurrency(payment.amount)}</strong></div>)}
          </div>}
          <section className="space-y-3 rounded-xl border border-outline-variant p-3">
            <Button type="button" variant="secondary" className="w-full" onClick={() => setShowPaymentQrs((current) => !current)}>
              <QrCode size={15} className="mr-1" /> {showPaymentQrs ? 'Hide payment QR codes' : 'Show payment QR codes'}
            </Button>
            {showPaymentQrs && (
              paymentAccounts.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {paymentAccounts.map((account, index) => (
                    <div key={`${account.number}-${index}`} className="rounded-lg border border-outline-variant bg-surface-container-low p-3 text-center">
                      <p className="text-xs font-bold">{account.label || account.name || `Lipa Namba ${index + 1}`}</p>
                      <p className="text-sm font-semibold text-primary">{account.number}</p>
                      <InternalQrCode
                        number={account.number}
                        uploadedImage={account.qrImage || account.qr_image || ''}
                        useInternal={account.useInternalQr !== false}
                        alt={`${account.label || account.name || 'Lipa Namba'} payment QR code`}
                        className="mx-auto mt-2 aspect-square h-44 w-44 rounded-lg bg-white object-contain p-2"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-xs text-surface-on-variant" role={paymentQrError ? 'alert' : 'status'}>
                  {paymentQrError || 'No Lipa Namba accounts are configured.'}
                </p>
              )
            )}
          </section>
          <div className="space-y-3">
            {tabPayments.map((payment, index) => <div key={index} className="grid grid-cols-1 gap-2 rounded-xl border border-outline-variant p-3 sm:grid-cols-3">
              <Input label="Amount (TZS)" type="number" min="1" step="1" value={payment.amount} onChange={(event) => setTabPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item))} />
              <label className="block text-xs font-semibold uppercase tracking-wide text-surface-on-variant">Method<select value={payment.method} onChange={(event) => setTabPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, method: event.target.value } : item))} className="input-field mt-1 w-full"><option value="cash">Cash</option><option value="lipa_namba">Mobile money</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label>
              <div className="flex items-end gap-2">{payment.method === 'lipa_namba' && <Input label="Verified transaction reference" value={payment.transactionId} onChange={(event) => setTabPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, transactionId: event.target.value } : item))} />}{tabPayments.length > 1 && <button type="button" aria-label="Remove payment part" onClick={() => setTabPayments((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="mb-1 rounded-lg border border-outline-variant p-2 text-error"><X size={15} /></button>}</div>
            </div>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setTabPayments((current) => [...current, { amount: '', method: 'cash', transactionId: '' }])}><Plus size={14} className="mr-1" /> Split payment</Button>
            <span className="ml-auto self-center text-xs text-surface-on-variant">Total entered: {formatCurrency(tabPayments.reduce((sum, item) => sum + (Number(item.amount) || 0), 0))}</span>
          </div>
          {error && <p className="text-sm text-error" role="alert">{error}</p>}
          <Button type="submit" className="w-full" disabled={savingPayment}>{savingPayment ? 'Recording…' : 'Record payment received'}</Button>
        </form>}
      </Modal>

      <Modal isOpen={showAdd || !!editTable} onClose={() => { setShowAdd(false); setEditTable(null); }} title={editTable ? 'Edit Table' : 'Add Table'}>
        <div className="space-y-4">
          {error && <div className="flex items-center justify-between rounded-xl border border-error/20 bg-error/5 p-3 text-sm text-error"><span>{error}</span><button type="button" onClick={() => setError('')}><X size={16} /></button></div>}
          <Input label="Table Number" type="number" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
          <Input label="Seats" type="number" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} />
          {editTable && <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-surface-on-variant">Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input-field"><option value="available">Available</option><option value="occupied">Occupied</option><option value="reserved">Reserved</option><option value="cleaning">Cleaning</option></select></div>}
          <Input label="NFC Tag ID" value={form.tagId} onChange={(e) => setForm({ ...form, tagId: e.target.value })} placeholder="WR-T01" />
          <Input label="Zone" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder="Main Dining" />
          {editTable && <Input label="Reservation" value={form.reservation} onChange={(e) => setForm({ ...form, reservation: e.target.value })} placeholder="e.g. 6:30 PM" />}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-surface-on-variant">Table Image</label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline-variant px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/5">
              <Upload size={16} /> {form.imageUrl ? 'Replace photo' : 'Upload image'}
              <input type="file" accept="image/*" className="sr-only" onChange={handlePhotoChange} />
            </label>
            {form.imageUrl && <img src={form.imageUrl} alt="Table preview" className="h-28 w-full rounded-xl object-cover" />}
          </div>
          <Input label="Table Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Tap NFC tag to identify guest table" />
          <Button onClick={handleSave} className="w-full">{editTable ? 'Save Table Changes' : 'Add Table'}</Button>
        </div>
      </Modal>
    </div>
  );
}
