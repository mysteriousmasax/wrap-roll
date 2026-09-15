import { execFile } from 'node:child_process';
import net from 'node:net';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ESC = 0x1b;
const GS = 0x1d;

function setting(settings, key, fallback = '') {
  return settings[key] ?? process.env[key] ?? fallback;
}

function text(value = '') {
  return Buffer.from(String(value).replace(/[\r\n]+/g, ' ').trim(), 'ascii');
}

function line(value = '') {
  return Buffer.concat([text(value), Buffer.from('\n', 'ascii')]);
}

function money(value, currency = 'TZS') {
  return `${currency} ${Number(value || 0).toLocaleString('en-TZ')}`;
}

export function buildReceipt(order, settings = {}) {
  const currency = setting(settings, 'currency', 'TZS');
  const restaurant = setting(settings, 'restaurant_name', 'Wrap & Roll');
  const branch = setting(settings, 'branch_location', '');
  const customer = order.customer || {};
  const chunks = [
    Buffer.from([ESC, 0x40]),
    Buffer.from([ESC, 0x61, 0x01, ESC, 0x45, 0x01]),
    line(restaurant),
    line(branch),
    line(`TEL: ${setting(settings, 'phone')}`),
    line(`TIN: ${setting(settings, 'tax_id', 'Not configured')}`),
    line(`VRN: ${setting(settings, 'tra_vrn', 'NOT REGISTERED')}`),
    line(`SERIAL: ${setting(settings, 'tra_serial_number', 'Pending VFD')}`),
    line(`UIN: ${setting(settings, 'tra_uin', 'Pending VFD')}`),
    Buffer.from([ESC, 0x45, 0x00, ESC, 0x61, 0x00]),
    line(`CUSTOMER: ${customer.name || order.customerName || order.customer_name || 'Walk-in customer'}`),
    line(`CUSTOMER TIN: ${customer.tin || customer.customerTin || ''}`),
    line(`MOBILE: ${customer.phone || order.customerPhone || order.customer_phone || ''}`),
    line(`Order: ${order.id || order.order_number || ''}`),
    line(new Date().toLocaleString('en-TZ')),
    line(`Type: ${order.type || order.orderType || ''}`),
    line('--------------------------------'),
  ];

  for (const item of order.items || []) {
    chunks.push(line(`${item.qty || 0}x ${item.name || ''}`));
    chunks.push(line(`  ${money(Number(item.price || 0) * Number(item.qty || 0), currency)}`));
  }

  chunks.push(
    line('--------------------------------'),
    line(`Subtotal: ${money(order.subtotal, currency)}`),
    line(`Tax: ${money(order.tax, currency)}`),
    Buffer.from([ESC, 0x45, 0x01]),
    line(`TOTAL: ${money(order.total, currency)}`),
    Buffer.from([ESC, 0x45, 0x00]),
    line(`Payment: ${order.paymentMethod || order.method || ''}`),
    line(`Receipt No: ${order.receiptNumber || order.receipt_number || 'Pending VFD'}`),
    line('Verification: Pending VFD'),
    line('Thank you for dining with us.'),
    Buffer.from('\n\n\n', 'ascii'),
    Buffer.from([GS, 0x56, 0x00]),
  );
  return Buffer.concat(chunks);
}

function writeTcp(buffer, host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: Number(port) }, () => socket.end(buffer));
    socket.once('close', resolve);
    socket.once('error', reject);
    socket.setTimeout(5000, () => socket.destroy(new Error('Printer connection timed out')));
  });
}

async function writeWindowsSerial(buffer, port, baudRate) {
  const payload = buffer.toString('base64');
  const encodedPort = Buffer.from(String(port), 'utf16le').toString('base64');
  const command = `$port=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedPort}')); $data=[Convert]::FromBase64String('${payload}'); $serial=[System.IO.Ports.SerialPort]::new($port,${Number(baudRate) || 9600},[System.IO.Ports.Parity]::None,8,[System.IO.Ports.StopBits]::One); try { $serial.Open(); $serial.Write($data,0,$data.Length) } finally { if ($serial.IsOpen) { $serial.Close() } }`;
  await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 10000 });
}

export async function printReceipt(order, settings = {}) {
  const transport = String(setting(settings, 'printer_transport', process.env.PRINTER_TRANSPORT || 'serial')).toLowerCase();
  const buffer = buildReceipt(order, settings);
  if (transport === 'tcp') {
    const host = setting(settings, 'printer_host', process.env.PRINTER_HOST);
    const port = setting(settings, 'printer_port', process.env.PRINTER_PORT || '9100');
    if (!host) throw new Error('Printer host is not configured');
    await writeTcp(buffer, host, port);
    return { transport, host, port: Number(port) };
  }

  const port = setting(settings, 'printer_path', process.env.PRINTER_PATH);
  if (!port) throw new Error('Printer COM port is not configured');
  const baudRate = setting(settings, 'printer_baud_rate', process.env.PRINTER_BAUD_RATE || '9600');
  await writeWindowsSerial(buffer, port, baudRate);
  return { transport: 'serial', port, baudRate: Number(baudRate) };
}