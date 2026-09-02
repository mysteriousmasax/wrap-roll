import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/format';
import { ArrowLeft, Send, MessageSquare } from 'lucide-react';

const templates = [
  { id: 1, name: 'Order Ready', message: 'Hi {name}! Your order {orderId} is ready for pickup. See you soon!', active: true, sent: 245 },
  { id: 2, name: 'Thank You', message: 'Thank you for dining with us, {name}! Rate your experience: {link}', active: true, sent: 189 },
  { id: 3, name: 'Win-Back', message: 'Hey {name}, we miss you! Enjoy 15% off your next visit. Code: COMEBACK15', active: false, sent: 67 },
];

export default function WhatsAppPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [sending, setSending] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.getCustomers().then(setCustomers);
  }, []);

  const sendMessage = async (customer) => {
    setSending(customer.id);
    setMessage('');
    try {
      const msg = activeTemplate
        ? activeTemplate.message.replace('{name}', customer.name.split(' ')[0])
        : 'Hello from Wrap & Roll!';
      await api.sendWhatsApp({ customerId: customer.id, message: msg, templateName: activeTemplate?.name });
      setMessage(`Message sent to ${customer.name}`);
    } catch (err) {
      setMessage(err.message || 'Failed to send');
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="WhatsApp Integration" subtitle="Automated customer messaging and outreach" actions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/crm')}><ArrowLeft size={14} /> Back to CRM</Button>
      } />

      {message && <p className="text-sm text-primary mb-4">{message}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="font-display font-bold text-sm uppercase text-surface-on-variant mb-3">Message Templates</h2>
          <div className="space-y-3">
            {templates.map((tmpl) => (
              <Card key={tmpl.id} onClick={() => setActiveTemplate(tmpl)} className={activeTemplate?.id === tmpl.id ? 'ring-2 ring-primary' : ''}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={16} className="text-success" />
                    <span className="font-bold text-sm">{tmpl.name}</span>
                  </div>
                  <Badge variant={tmpl.active ? 'green' : 'default'}>{tmpl.active ? 'Active' : 'Inactive'}</Badge>
                </div>
                <p className="text-xs text-surface-on-variant bg-surface-container-low p-2 rounded-lg">{tmpl.message}</p>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-display font-bold text-sm uppercase text-surface-on-variant mb-3">Customers ({customers.length})</h2>
          <div className="space-y-2">
            {customers.map((c) => (
              <Card key={c.id} className="flex items-center gap-3 !p-3">
                <div className="w-9 h-9 rounded-full bg-success/10 flex items-center justify-center font-bold text-xs text-success">
                  {c.name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{c.name}</p>
                  <p className="text-xs text-surface-on-variant">{c.phone}</p>
                </div>
                <p className="text-xs font-bold text-primary">{formatCurrency(c.lifetimeValue)}</p>
                <Button variant="ghost" size="sm" disabled={sending === c.id} onClick={() => sendMessage(c)}>
                  <Send size={14} />
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
