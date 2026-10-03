import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { api } from '../../../api/client';

function statusStyle(status) {
  if (['found', 'configured', 'matched'].includes(status)) return 'text-green-700';
  if (status === 'not_applicable') return 'text-surface-on-variant';
  if (status === 'check') return 'text-amber-700';
  return 'text-red-700';
}

export default function EmailSetupPanel({ onReport }) {
  const [configuration, setConfiguration] = useState(null);
  const [testAddress, setTestAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    api.getEmailDeliverability().then(setConfiguration).catch((error) => onReport('error', error.message || 'Unable to check email setup.')).finally(() => setLoading(false));
  }, [refreshKey]);

  const testSmtp = async (event) => {
    event.preventDefault();
    setTesting(true);
    try {
      const result = await api.testEmailSmtp(testAddress);
      onReport('success', `Test email accepted for ${result.recipient}. Check that inbox and spam folder.`);
    } catch (error) { onReport('error', error.message || 'Test email failed.'); }
    finally { setTesting(false); }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><ShieldCheck size={17} className="text-primary" /><div><h2 className="font-display text-base font-bold">Deliverability checks</h2><p className="text-xs text-surface-on-variant">DNS authentication is checked for {configuration?.domain || 'the sender domain'}.</p></div></div><Button size="sm" variant="secondary" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Check again</Button></div>
        <div className="divide-y divide-outline-variant">
          {(configuration?.checks || []).map((check) => <div key={check.id} className="flex items-start gap-3 py-3"><div className={`mt-0.5 ${statusStyle(check.status)}`}>{['found', 'configured', 'matched'].includes(check.status) ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold">{check.label}</p><span className={`text-[10px] font-bold uppercase ${statusStyle(check.status)}`}>{check.status.replace('_', ' ')}</span></div><p className="mt-1 break-words text-xs text-surface-on-variant">{check.detail || check.hostname || ''}</p>{check.record && <code className="mt-1 block break-all rounded bg-surface-container-low p-2 text-[10px]">{check.record}</code>}{check.records?.length > 0 && <p className="mt-1 break-all text-[10px] text-surface-on-variant">{check.records.map((record) => record.exchange || record).join(', ')}</p>}</div></div>)}
          {loading && <p className="py-6 text-xs text-surface-on-variant">Checking sender DNS records...</p>}
        </div>
      </Card>
      <div className="space-y-5">
        <Card className="p-5"><h2 className="font-display text-base font-bold">Verify email delivery</h2><p className="mt-1 text-xs text-surface-on-variant">Send one test message using the configured Wrap & Roll sender.</p><form className="mt-4 space-y-3" onSubmit={testSmtp}><label className="block text-xs font-semibold">Test recipient<input required type="email" className="input-field mt-1 w-full" value={testAddress} onChange={(event) => setTestAddress(event.target.value)} placeholder="your inbox@example.com" /></label><Button size="sm" type="submit" disabled={testing || !(configuration?.deliveryConfigured || configuration?.smtpConfigured)}><Send size={14} /> {testing ? 'Sending...' : 'Send test email'}</Button></form><p className="mt-3 text-[10px] text-surface-on-variant">A successful provider response means the message was accepted for delivery; it does not guarantee inbox placement.</p></Card>
        <Card className="p-5"><h2 className="font-display text-base font-bold">Railway sender variables</h2><ul className="mt-3 space-y-2 text-xs text-surface-on-variant"><li><code>RESEND_API_KEY</code> for Resend API delivery</li><li><code>EMAIL_FROM_NAME</code>, <code>EMAIL_FROM_ADDRESS</code>, <code>EMAIL_REPLY_TO</code></li><li><code>EMAIL_SMTP_HOST</code>, <code>EMAIL_SMTP_PORT</code>, <code>EMAIL_SMTP_SECURE</code></li><li><code>EMAIL_SMTP_USER</code>, <code>EMAIL_SMTP_PASS</code></li><li><code>EMAIL_POSTAL_ADDRESS</code>, <code>EMAIL_DKIM_SELECTOR</code></li><li><code>PUBLIC_APP_URL</code>, <code>JWT_SECRET</code></li></ul><p className="mt-3 text-[11px] text-surface-on-variant">Set credentials in Railway Variables; never paste secrets into campaign forms. The sender address must be verified with Resend when using its API.</p></Card>
      </div>
    </div>
  );
}
