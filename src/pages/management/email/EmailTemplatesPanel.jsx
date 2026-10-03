import { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Save, Trash2 } from 'lucide-react';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { api } from '../../../api/client';

const blankTemplate = { name: '', category: 'marketing', subject: '', preheader: '', body_text: '' };

function makeHtml(body) {
  const escaped = String(body || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  return `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#24211e">${escaped.split(/\r?\n/).map((line) => line || '&nbsp;').join('<br>')}</div>`;
}

export default function EmailTemplatesPanel({ onReport }) {
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(blankTemplate);
  const [preview, setPreview] = useState(false);
  const [working, setWorking] = useState(false);
  const selected = useMemo(() => templates.find((template) => String(template.id) === String(selectedId)), [templates, selectedId]);

  const load = async () => {
    const rows = await api.getEmailTemplates();
    setTemplates(rows);
    if (selectedId) {
      const match = rows.find((template) => String(template.id) === String(selectedId));
      if (match) setForm(match);
    }
  };

  useEffect(() => { load().catch((error) => onReport('error', error.message || 'Unable to load templates.')); }, []);

  const selectTemplate = (value) => {
    setSelectedId(value);
    const template = templates.find((item) => String(item.id) === String(value));
    setForm(template ? { ...template } : blankTemplate);
    setPreview(false);
  };

  const saveTemplate = async (event) => {
    event.preventDefault();
    setWorking(true);
    try {
      if (selected) {
        const updated = await api.updateEmailTemplate(selected.id, { ...form, htmlBody: makeHtml(form.body_text) });
        setSelectedId(String(updated.id));
        onReport('success', 'Template updated.');
      } else {
        const created = await api.createEmailTemplate({ ...form, htmlBody: makeHtml(form.body_text) });
        setSelectedId(String(created.id));
        onReport('success', 'Template created.');
      }
      await load();
    } catch (error) { onReport('error', error.message || 'Unable to save template.'); }
    finally { setWorking(false); }
  };

  const deleteTemplate = async () => {
    if (!selected || selected.is_system) return;
    if (!window.confirm(`Delete template “${selected.name}”?`)) return;
    try { await api.deleteEmailTemplate(selected.id); setSelectedId(''); setForm(blankTemplate); await load(); onReport('success', 'Template deleted.'); }
    catch (error) { onReport('error', error.message || 'Unable to delete template.'); }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-sm font-bold">Templates</h2><Button size="xs" variant="secondary" onClick={() => selectTemplate('')}><Plus size={13} /> New</Button></div><div className="divide-y divide-outline-variant">{templates.map((template) => <button key={template.id} className={`flex w-full items-start justify-between gap-2 py-3 text-left ${String(template.id) === String(selectedId) ? 'text-primary' : 'text-surface-on'}`} onClick={() => selectTemplate(String(template.id))}><span className="min-w-0"><span className="block truncate text-xs font-bold">{template.name}</span><span className="mt-1 block text-[10px] capitalize text-surface-on-variant">{template.category}</span></span>{template.is_system ? <span className="shrink-0 text-[9px] font-bold uppercase text-surface-on-variant">Built-in</span> : null}</button>)}</div></Card>
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2"><FileText size={17} className="text-primary" /><div><h2 className="font-display text-base font-bold">{selected ? 'Edit template' : 'New template'}</h2><p className="text-xs text-surface-on-variant">Personalization fields: {'{{first_name}}'}, {'{{offer}}'}, {'{{restaurant_name}}'}.</p></div></div>
        <form className="grid gap-3 lg:grid-cols-2" onSubmit={saveTemplate}>
          <label className="block text-xs font-semibold">Template name<input required className="input-field mt-1 w-full" value={form.name || ''} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label className="block text-xs font-semibold">Category<select className="input-field mt-1 w-full" value={form.category || 'marketing'} onChange={(event) => setForm({ ...form, category: event.target.value })}>{['transactional', 'welcome', 'post_visit', 'birthday', 'winback', 'newsletter', 'offer', 'event', 'marketing'].map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="block text-xs font-semibold lg:col-span-2">Subject<input required className="input-field mt-1 w-full" value={form.subject || ''} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></label>
          <label className="block text-xs font-semibold lg:col-span-2">Preheader<input className="input-field mt-1 w-full" value={form.preheader || ''} onChange={(event) => setForm({ ...form, preheader: event.target.value })} /></label>
          <label className="block text-xs font-semibold lg:col-span-2">Text body<textarea required rows={12} className="input-field mt-1 w-full font-mono text-xs" value={form.body_text || ''} onChange={(event) => setForm({ ...form, body_text: event.target.value })} /></label>
          <div className="flex flex-wrap gap-2 lg:col-span-2"><Button size="sm" type="submit" disabled={working}><Save size={14} /> Save template</Button><Button size="sm" type="button" variant="secondary" onClick={() => setPreview((value) => !value)}>Preview</Button>{selected && !selected.is_system && <Button size="sm" type="button" variant="danger" onClick={deleteTemplate}><Trash2 size={14} /> Delete</Button>}</div>
        </form>
        {preview && <div className="mt-5 border-t border-outline-variant pt-4"><p className="mb-2 text-xs font-bold">Preview</p><iframe title="Email template preview" sandbox="" className="h-72 w-full rounded-lg border border-outline-variant bg-white" srcDoc={makeHtml(form.body_text).replaceAll('{{first_name}}', 'Amina').replaceAll('{{offer}}', '15% off your next order').replaceAll('{{restaurant_name}}', 'Wrap & Roll')} /></div>}
      </Card>
    </div>
  );
}
