import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWifiQrPayload } from '../utils/wifiQr.js';

test('builds a WPA Wi-Fi QR payload and escapes reserved characters', () => {
  assert.equal(
    buildWifiQrPayload('Wrap; Roll:5G', 'Best,wrap\\s@'),
    'WIFI:T:WPA;S:Wrap\\; Roll\\:5G;P:Best\\,wrap\\\\s@;H:false;;'
  );
});

test('supports a password-free Wi-Fi network', () => {
  assert.equal(buildWifiQrPayload('Guest Wi-Fi', '', 'NOPASS'), 'WIFI:T:NOPASS;S:Guest Wi-Fi;P:;H:false;;');
});

test('rejects missing SSIDs, missing passwords, and unsupported security types', () => {
  assert.throws(() => buildWifiQrPayload('', 'secret'), /network name is required/);
  assert.throws(() => buildWifiQrPayload('Staff Wi-Fi', ''), /password is required/);
  assert.throws(() => buildWifiQrPayload('Staff Wi-Fi', 'secret', 'OPEN'), /security must be WPA, WEP, or NOPASS/);
});