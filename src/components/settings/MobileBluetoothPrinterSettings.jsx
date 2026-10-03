import { useEffect, useState } from 'react';
import { Bluetooth, RefreshCw, Settings2 } from 'lucide-react';
import Button from '../ui/Button';
import { Capacitor } from '@capacitor/core';
import { MOBILE_PRINTER_KEY, ThermalPrinter } from '../../native/thermalPrinter';

export default function MobileBluetoothPrinterSettings() {
  const [devices, setDevices] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(() => localStorage.getItem(MOBILE_PRINTER_KEY) || '');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const isAndroid = Capacitor.getPlatform() === 'android';

  const refreshDevices = async () => {
    setLoading(true);
    try {
      const result = await ThermalPrinter.getPairedDevices();
      const pairedDevices = result.devices || [];
      setDevices(pairedDevices);
      if (selectedAddress && !pairedDevices.some((device) => device.address === selectedAddress)) {
        setSelectedAddress('');
        localStorage.removeItem(MOBILE_PRINTER_KEY);
      }
      setStatus(pairedDevices.length ? `${pairedDevices.length} paired device${pairedDevices.length === 1 ? '' : 's'} found` : 'Pair the printer in Android Bluetooth settings, then refresh.');
    } catch (error) {
      setStatus(error.message || 'Unable to read paired Bluetooth devices.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAndroid) refreshDevices();
  }, [isAndroid]);

  if (!isAndroid) return null;

  const openBluetoothSettings = async () => {
    try {
      await ThermalPrinter.openBluetoothSettings();
      setStatus('Pair the thermal printer, return here, then refresh the paired devices.');
    } catch (error) {
      setStatus(error.message || 'Unable to open Bluetooth settings.');
    }
  };

  const selectDevice = (address) => {
    setSelectedAddress(address);
    if (address) localStorage.setItem(MOBILE_PRINTER_KEY, address);
    else localStorage.removeItem(MOBILE_PRINTER_KEY);
    setStatus(address ? 'Bluetooth printer selected for this phone.' : 'No Bluetooth printer selected.');
  };

  return (
    <div className="mt-5 space-y-3 rounded-xl border border-outline-variant bg-surface-container-low p-4">
      <div className="flex items-start gap-3">
        <Bluetooth size={18} className="mt-0.5 text-primary" />
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold">Phone Bluetooth printer</h4>
          <p className="mt-1 text-xs text-surface-on-variant">Pair the SPP printer in Android settings, then select it here. Receipts print directly from this phone.</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <select className="input-field min-w-0" aria-label="Paired phone printer" value={selectedAddress} onChange={(event) => selectDevice(event.target.value)}>
          <option value="">Select paired printer</option>
          {devices.map((device) => <option key={device.address} value={device.address}>{device.name} · {device.address}</option>)}
        </select>
        <Button type="button" variant="secondary" onClick={openBluetoothSettings}><Settings2 size={14} /> Pair device</Button>
        <Button type="button" variant="secondary" onClick={refreshDevices} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</Button>
      </div>
      {status && <p className="text-xs text-surface-on-variant" role="status">{status}</p>}
    </div>
  );
}