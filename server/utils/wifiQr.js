const supportedSecurityTypes = new Set(['WPA', 'WEP', 'NOPASS']);

function escapeWifiValue(value) {
  return String(value).replace(/[\\;,:\"]/g, '\\$&');
}

export function buildWifiQrPayload(ssid, password, security = 'WPA') {
  const networkName = String(ssid || '').trim();
  const networkPassword = String(password || '');
  const securityType = String(security || 'WPA').trim().toUpperCase();

  if (!networkName) throw new Error('Wi-Fi network name is required.');
  if (!supportedSecurityTypes.has(securityType)) throw new Error('Wi-Fi security must be WPA, WEP, or NOPASS.');
  if (securityType !== 'NOPASS' && !networkPassword) throw new Error('Wi-Fi password is required.');

  return `WIFI:T:${securityType};S:${escapeWifiValue(networkName)};P:${escapeWifiValue(networkPassword)};H:false;;`;
}