import { useEffect, useState } from 'react';
import { Clock3, Pause, Play, Plus, Workflow } from 'lucide-react';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { api } from '../../../api/client';

const triggers = [
  ['subscriber_added', 'New subscriber'],
  ['post_visit', 'Paid visit / order'],
  ['birthday', 'Customer birthday'],
  ['winback', 'Lapsed guest'],
  ['reservation.created', 'Reservation confirmed (webhook)'],
  ['order.created', 'Online order created (webhook)'],
  ['order.abandoned', 'Abandoned cart / order (webhook)'],
  ['catering.inquiry', 'Catering inquiry (webhook)'],
  ['giftcard.purchased', 'Gift card purchase (webhook)'],
];

export default function EmailAutomationsPanel({ onReport }) {
  const [automations, setAutomations] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({ name: '', triggerType: 'subscriber_added', steps: [{ templateId: '', delayMinutes: 0 }], inactiveDays: 60 });
  const [workingId, setWorkingId] = useState(null);

  const load = async () => {
    const [flows, messageTemplates] = await Promise.all([api.getEmailAutomations(), api.getEmailTemplates()]);
    setAutomations(flows);
    setTemplates(messageTemplates);
    if (!form.steps[0]?.templateId && messageTemplates[0]) setForm((current) => ({ ...current, steps: current.steps.map((step, index) => index === 0 ? { ...step, templateId: String(messageTemplates[0].id) } : step) }));
  };

  useEffect(() => { load().catch((error) => onReport('error', error.message || 'Unable to load automations.')); }, []);

  const toggle = async (automation) => {
    setWorkingId(automation.id);
    try {
      const status = automation.status === 'active' ? 'paused' : 'active';
      await api.updateEmailAutomation(automation.id, { status });
      await load();
      onReport('success', status === 'active' ? 'Automation activated.' : 'Automation paused.');
    } catch (error) { onReport('error', error.message || 'Unable to update automation.'); }
    finally { setWorkingId(null); }
  };

  const create = async (event) => {
    event.preventDefault();
    const steps = form.steps.map((step) => {
      const template = templates.find((item) => String(item.id) === String(step.templateId));
      return template ? { templateId: template.id, delayMinutes: Number(step.delayMinutes), subject: template.subject, bodyText: template.body_text } : null;
    });
    if (steps.some((step) => !step)) return onReport('error', 'Choose a message template for every sequence step.');
    setWorkingId('new');
    try {
      await api.createEmailAutomation({
        name: form.name,
        triggerType: form.triggerType,
        config: form.triggerType === 'winback' ? { inactiveDays: Number(form.inactiveDays) } : {},
        steps,
      });
      setForm({ ...form, name: '' });
      await load();
      onReport('success', 'Automation saved paused. Review it, then activate when ready.');
    } catch (error) { onReport('error', error.message || 'Unable to create automation.'); }
    finally { setWorkingId(null); }
  };

  const remove = async (automation) => {
    if (automation.status === 'active' || !window.confirm(`Delete “${automation.name}”?`)) return;
    try { await api.deleteEmailAutomation(automation.id); await load(); onReport('success', 'Automation deleted.'); }
    catch (error) { onReport('error', error.message || 'Unable to delete automation.'); }
  };

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
      <Card className="min-w-0 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2"><Workflow size={17} className="text-primary" /><div><h2 className="font-display text-base font-bold">Automations</h2><p className="text-xs text-surface-on-variant">Flows only enroll subscribed contacts and stop when they opt out.</p></div></div>
        <div className="divide-y divide-outline-variant">
          {automations.map((automation) => <div key={automation.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{automation.name}</h3><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${automation.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-surface-container-low text-surface-on-variant'}`}>{automation.status}</span></div><p className="mt-1 text-xs text-surface-on-variant">{triggers.find(([key]) => key === automation.trigger_type)?.[1] || automation.trigger_type} · {automation.steps?.length || 0} step{automation.steps?.length === 1 ? '' : 's'} · {automation.activeEnrollments || 0} active</p><p className="mt-1 text-[10px] text-surface-on-variant">{automation.steps?.map((step) => `${step.delay_minutes} min: ${step.subject}`).join(' → ')}</p></div>
            <div className="flex gap-2"><Button size="xs" variant="secondary" onClick={() => toggle(automation)} disabled={workingId === automation.id}>{automation.status === 'active' ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Activate</>}</Button>{automation.status !== 'active' && <Button size="xs" variant="danger" onClick={() => remove(automation)}>Delete</Button>}</div>
          </div>)}
          {!automations.length && <p className="py-8 text-center text-xs text-surface-on-variant">No automations configured.</p>}
        </div>
      </Card>
      <Card className="min-w-0 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2"><Plus size={16} className="text-primary" /><h2 className="font-display text-base font-bold">New sequence</h2></div>
        <form className="space-y-3" onSubmit={create}>
          <label className="block text-xs font-semibold">Name<input required className="input-field mt-1 w-full" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="After-visit follow-up" /></label>
          <label className="block text-xs font-semibold">Trigger<select className="input-field mt-1 w-full" value={form.triggerType} onChange={(event) => setForm({ ...form, triggerType: event.target.value })}>{triggers.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          {form.triggerType === 'winback' && <label className="block text-xs font-semibold">Days without a visit<input className="input-field mt-1 w-full" type="number" min="30" max="365" value={form.inactiveDays} onChange={(event) => setForm({ ...form, inactiveDays: event.target.value })} /></label>}
          <div className="space-y-3">
            {form.steps.map((step, index) => <div key={index} className="grid min-w-0 gap-2 rounded-lg border border-outline-variant p-3 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
              <label className="block text-xs font-semibold">Step {index + 1} template<select className="input-field mt-1 w-full" value={step.templateId} onChange={(event) => setForm({ ...form, steps: form.steps.map((item, itemIndex) => itemIndex === index ? { ...item, templateId: event.target.value } : item) })}><option value="">Choose a template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
              <label className="block text-xs font-semibold">Wait (minutes)<input className="input-field mt-1 w-full" type="number" min="0" max="525600" value={step.delayMinutes} onChange={(event) => setForm({ ...form, steps: form.steps.map((item, itemIndex) => itemIndex === index ? { ...item, delayMinutes: event.target.value } : item) })} /></label>
              <Button type="button" size="xs" variant="danger" className="self-end" disabled={form.steps.length === 1} onClick={() => setForm({ ...form, steps: form.steps.filter((_, itemIndex) => itemIndex !== index) })}>Remove</Button>
            </div>)}
            {form.steps.length < 12 && <Button type="button" size="xs" variant="secondary" onClick={() => setForm({ ...form, steps: [...form.steps, { templateId: templates[0] ? String(templates[0].id) : '', delayMinutes: 1440 }] })}><Plus size={13} /> Add step</Button>}
          </div>
          <p className="flex items-center gap-2 text-[11px] text-surface-on-variant"><Clock3 size={13} /> Delays are measured from enrollment for the first step and from the previous message for later steps. New sequences start paused.</p>
          <Button type="submit" size="sm" disabled={workingId === 'new' || !templates.length}><Plus size={14} /> Save paused</Button>
        </form>
      </Card>
    </div>
  );
}
