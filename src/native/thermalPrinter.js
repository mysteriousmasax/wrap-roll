import { Capacitor, registerPlugin } from '@capacitor/core';

export const MOBILE_PRINTER_KEY = 'wraproll_bluetooth_printer_address';
export const ThermalPrinter = registerPlugin('ThermalPrinter');

export function isAndroidCompanion() {
  return Capacitor.getPlatform() === 'android';
}

export async function printOnAndroidPrinter(text) {
  if (!isAndroidCompanion()) return false;
  const address = localStorage.getItem(MOBILE_PRINTER_KEY);
  if (!address) throw new Error('Choose a paired Bluetooth printer in Settings first.');
  await ThermalPrinter.print({ address, text });
  return true;
}