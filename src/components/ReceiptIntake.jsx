import { useEffect, useRef, useState } from 'react';
import { Barcode, Camera, FileText, Plus, ScanLine, Trash2 } from 'lucide-react';
import Button from './ui/Button';
import Modal from './ui/Modal';
import { api } from '../api/client';
import { parseReceiptText } from '../utils/receiptParser';

const localDate = () => new Date().toLocaleDateString('en-CA');
const emptyStockLine = () => ({ inventoryId: '', sku: '', name: '', quantity: '', unit: 'pcs', unitCost: '', threshold: '' });

export default function ReceiptIntake({ inventory = [], onClose, onComplete }) {
  const [mode, setMode] = useState('receipt');
  const [destination, setDestination] = useState('expense');
  const [expenseDate, setExpenseDate] = useState(localDate());
  const [supplier, setSupplier] = useState('');
  const [receiptRef, setReceiptRef] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [rawText, setRawText] = useState('');
  const [barcode, setBarcode] = useState('');
  const [stockLines, setStockLines] = useState([emptyStockLine()]);
  const [activeStockLine, setActiveStockLine] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const cameraVideoRef = useRef(null);

  useEffect(() => {
    if (!cameraOpen) return undefined;
    let stopped = false;
    let controls;
    const startScanner = async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromVideoDevice(undefined, cameraVideoRef.current, (result) => {
          if (!result || stopped) return;
          setBarcode(result.getText());
          setCameraOpen(false);
        });
        if (stopped) controls?.stop();
      } catch (scanError) {
        if (!stopped) {
          setError(scanError.message || 'Camera scanner could not start. Enter the barcode manually.');
          setCameraOpen(false);
        }
      }
    };
    startScanner();
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [cameraOpen]);

  useEffect(() => {
    const code = String(barcode || '').trim().toLowerCase();
    if (!code) return;
    const matchedItem = inventory.find((item) => String(item.sku || '').trim().toLowerCase() === code);
    setDestination('inventory');
    setStockLines((current) => current.map((line, index) => index === activeStockLine ? {
      ...line,
      inventoryId: matchedItem ? String(matchedItem.id) : '',
      sku: barcode.trim(),
      name: matchedItem?.name || line.name,
      unit: matchedItem?.unit || line.unit,
      threshold: matchedItem ? String(matchedItem.threshold ?? 0) : line.threshold,
    } : line));
    setNotice(matchedItem ? `Matched ${matchedItem.name}. Enter the received quantity.` : 'Barcode captured. Choose an existing stock item or enter a new item name.');
  }, [barcode, inventory, activeStockLine]);

  const updateStockLine = (index, field, value) => setStockLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value, ...(field === 'inventoryId' ? (() => { const item = inventory.find((entry) => String(entry.id) === value); return item ? { name: item.name, sku: item.sku || '', unit: item.unit || 'pcs', threshold: String(item.threshold ?? 0) } : { threshold: '' }; })() : {}) } : line));

  const recognizeReceipt = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    setError('');
    setNotice('Reading receipt. Check the extracted values before saving.');
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      try {
        const { data } = await worker.recognize(file);
        setRawText(data.text || '');
        const parsed = parseReceiptText(data.text || '');
        if (parsed.supplier) setSupplier(parsed.supplier);
        if (parsed.expenseDate) setExpenseDate(parsed.expenseDate);
        if (parsed.receiptRef) setReceiptRef(parsed.receiptRef);
        if (parsed.amount) setAmount(String(parsed.amount));
        if (parsed.description) setDescription(parsed.description);
        if (parsed.items.length) {
          setStockLines(parsed.items.map((item) => {
            const matchedItem = inventory.find((entry) => entry.name.trim().toLowerCase() === item.name.trim().toLowerCase());
            return {
              ...emptyStockLine(),
              ...item,
              inventoryId: matchedItem ? String(matchedItem.id) : '',
              sku: matchedItem?.sku || '',
              unit: matchedItem?.unit || item.unit,
              threshold: matchedItem ? String(matchedItem.threshold ?? 0) : '',
              quantity: String(item.quantity),
              unitCost: String(item.unitCost),
            };
          }));
          setActiveStockLine(0);
          setDestination('both');
          setNotice(`Receipt scanned. Found ${parsed.items.length} possible stock item${parsed.items.length === 1 ? '' : 's'}; review each item and total before saving.`);
        } else {
          setNotice('Receipt scanned. Review every field; nothing is posted until you confirm.');
        }
      } finally {
        await worker.terminate();
      }
    } catch (ocrError) {
      setError(ocrError.message || 'Receipt OCR failed. Enter the receipt details manually.');
    } finally {
      setProcessing(false);
      event.target.value = '';
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (destination === 'expense') {
        if (!Number(amount) || Number(amount) <= 0 || !description.trim()) throw new Error('Confirm a description and positive total before saving.');
        await api.createBusinessExpense({ expenseDate, category: 'Food supplies', description: description.trim(), supplier: supplier.trim(), amount: Number(amount), paymentMethod, receiptRef: receiptRef.trim() });
        onComplete('Receipt saved as a pending expense for approval.');
      } else {
        const validLines = stockLines.filter((line) => line.name.trim() && Number(line.quantity) > 0).map((line) => ({
          ...line,
          inventoryId: line.inventoryId ? Number(line.inventoryId) : null,
          quantity: Number(line.quantity),
          unitCost: Number(line.unitCost) || 0,
          threshold: Number(line.threshold) || 0,
        }));
        if (!validLines.length) throw new Error('Scan a barcode or enter a stock item and received quantity.');
        const expense = destination === 'both' ? {
          category: 'Food supplies',
          description: description.trim(),
          amount: Number(amount),
          paymentMethod,
        } : undefined;
        if (destination === 'both' && (!expense.description || !expense.amount || expense.amount <= 0)) throw new Error('Confirm an expense description and positive total before saving.');
        await api.receiveInventoryReceipt({ receiptDate: expenseDate, supplier: supplier.trim(), receiptRef: receiptRef.trim(), items: validLines, expense });
        onComplete(destination === 'both'
          ? `Expense submitted and ${validLines.length} stock item${validLines.length === 1 ? '' : 's'} received.`
          : `Stock receipt saved. ${validLines.length} item${validLines.length === 1 ? '' : 's'} added to inventory.`);
      }
    } catch (saveError) {
      setError(saveError.message || 'Receipt could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Receipt & barcode intake" size="xl" className="min-w-0">
      <div className="min-w-0 space-y-4">
        <p className="text-sm text-surface-on-variant">Scan a receipt or product barcode, review the extracted details, then choose where to post it. Nothing is posted automatically.</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Scan type">
          <button type="button" onClick={() => setMode('receipt')} aria-pressed={mode === 'receipt'} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold ${mode === 'receipt' ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant'}`}><FileText size={16} /> Receipt photo</button>
          <button type="button" onClick={() => { setMode('barcode'); setDestination('inventory'); }} aria-pressed={mode === 'barcode'} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold ${mode === 'barcode' ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant'}`}><Barcode size={16} /> Barcode / SKU</button>
        </div>

        {mode === 'receipt' ? <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
          <label className="block text-xs font-semibold">Receipt photo<input type="file" accept="image/*" capture="environment" onChange={recognizeReceipt} disabled={processing} className="mt-2 block w-full text-xs" /></label>
          <p className="mt-2 text-[11px] text-surface-on-variant">OCR runs in this browser. Review supplier, date, reference, and total before creating an expense or stock receipt.</p>
          {processing && <p className="mt-2 text-xs font-bold text-primary">Reading receipt…</p>}
        </div> : <div className="space-y-3 rounded-xl border border-outline-variant bg-surface-container-low p-3">
          <label className="block text-xs font-semibold">Barcode or SKU<input autoFocus value={barcode} onChange={(event) => setBarcode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); setBarcode(event.currentTarget.value.trim()); } }} placeholder="Scan with USB scanner or type SKU" className="input-field mt-1 w-full" /></label>
          <Button type="button" variant="secondary" size="sm" onClick={() => setCameraOpen(true)}><Camera size={14} /> Scan with camera</Button>
          {cameraOpen && <video ref={cameraVideoRef} autoPlay muted playsInline className="max-h-64 w-full rounded-lg bg-black object-contain" />}
          {notice && <p className="text-xs text-surface-on-variant">{notice}</p>}
        </div>}

        {mode === 'receipt' && <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Receipt destination">
            {[['expense', 'Expense'], ['inventory', 'Inventory'], ['both', 'Both']].map(([value, label]) => <button key={value} type="button" aria-pressed={destination === value} onClick={() => setDestination(value)} className={`rounded-lg border px-3 py-2 text-sm font-bold ${destination === value ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant'}`}>{label}</button>)}
          </div>
          <label className="block text-xs font-semibold">Receipt date<input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} className="input-field mt-1 w-full" /></label>
        </div>}

        <form onSubmit={submit} className="min-w-0 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">Supplier<input value={supplier} onChange={(event) => setSupplier(event.target.value)} className="input-field mt-1 w-full" /></label>
            <label className="text-xs font-semibold">Receipt reference<input value={receiptRef} onChange={(event) => setReceiptRef(event.target.value)} className="input-field mt-1 w-full" /></label>
          </div>
          {destination !== 'inventory' && <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">Description<input required value={description} onChange={(event) => setDescription(event.target.value)} className="input-field mt-1 w-full" /></label>
            <label className="text-xs font-semibold">Total (TZS)<input required type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} className="input-field mt-1 w-full" /></label>
            <label className="text-xs font-semibold">Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="input-field mt-1 w-full"><option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="bank">Bank</option><option value="card">Card</option></select></label>
          </div>}
          {destination !== 'expense' && <div className="space-y-3">
            {stockLines.map((line, index) => <div key={index} className="grid min-w-0 gap-2 rounded-lg border border-outline-variant p-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">Match inventory item<select value={line.inventoryId} onChange={(event) => updateStockLine(index, 'inventoryId', event.target.value)} className="input-field mt-1 w-full"><option value="">New item / enter below</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku || 'no SKU'}</option>)}</select></label>
              <label className="text-xs font-semibold">Item name<input required value={line.name} onChange={(event) => updateStockLine(index, 'name', event.target.value)} className="input-field mt-1 w-full" /></label>
              <label className="text-xs font-semibold">SKU / barcode<input value={line.sku} onChange={(event) => updateStockLine(index, 'sku', event.target.value)} className="input-field mt-1 w-full" /></label>
              <div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold">Qty<input required type="number" min="0.001" step="any" value={line.quantity} onChange={(event) => updateStockLine(index, 'quantity', event.target.value)} className="input-field mt-1 w-full" /></label><label className="text-xs font-semibold">Unit<input value={line.unit} onChange={(event) => updateStockLine(index, 'unit', event.target.value)} className="input-field mt-1 w-full" /></label><label className="text-xs font-semibold">Unit cost (TZS)<input required type="number" min="0" value={line.unitCost} onChange={(event) => updateStockLine(index, 'unitCost', event.target.value)} className="input-field mt-1 w-full" /></label><label className="text-xs font-semibold">Low-stock alert at<input required={!line.inventoryId} type="number" min="0" step="any" disabled={Boolean(line.inventoryId)} value={line.threshold} onChange={(event) => updateStockLine(index, 'threshold', event.target.value)} placeholder="e.g. 2 kg" className="input-field mt-1 w-full disabled:bg-surface-container" /></label></div>
              {stockLines.length > 1 && <Button type="button" size="xs" variant="danger" className="justify-self-end" onClick={() => setStockLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><Trash2 size={13} /> Remove line</Button>}
            </div>)}
            <Button type="button" size="sm" variant="secondary" onClick={() => { setStockLines((current) => [...current, emptyStockLine()]); setActiveStockLine(stockLines.length); }}><Plus size={14} /> Add stock line</Button>
          </div>}

          {rawText && <details className="rounded-lg border border-outline-variant p-3"><summary className="cursor-pointer text-xs font-bold">Review/edit OCR source text</summary><textarea rows={5} value={rawText} onChange={(event) => setRawText(event.target.value)} className="input-field mt-2 w-full font-mono text-xs" /></details>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-outline-variant pt-3"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || processing}>{saving ? 'Saving…' : destination === 'expense' ? 'Submit expense for approval' : destination === 'both' ? 'Submit expense + receive stock' : 'Receive stock'}</Button></div>
        </form>
      </div>
    </Modal>
  );
}