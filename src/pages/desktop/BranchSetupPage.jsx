import { useState } from 'react';
import { api } from '../../api/client';
import Button from '../../components/ui/Button';

export default function BranchSetupPage() {
  const [branchCode, setBranchCode] = useState('');
  const [branchName, setBranchName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.enrollDesktopBranch({ branchCode, branchName });
      window.location.href = '/pos';
    } catch (submitError) {
      setError(submitError.message || 'Unable to save branch details.');
      setSaving(false);
    }
  };

  return <div className="min-h-screen bg-[#faf7f2] flex items-center justify-center p-5"><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-[#ebdccb] bg-white p-6 shadow-xl"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Offline desktop setup</p><h1 className="mt-2 font-display text-2xl font-bold">Set up this branch</h1><p className="mt-2 text-sm text-surface-on-variant">This information identifies the local offline till and keeps branch data separate.</p><label className="mt-6 block text-xs font-bold uppercase text-surface-on-variant">Branch code<input required pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" value={branchCode} onChange={(event) => setBranchCode(event.target.value.toUpperCase())} className="input-field mt-1" placeholder="KINONDONI" /></label><label className="mt-4 block text-xs font-bold uppercase text-surface-on-variant">Branch name<input required value={branchName} onChange={(event) => setBranchName(event.target.value)} className="input-field mt-1" placeholder="Wrap & Roll Kinondoni" /></label>{error && <p className="mt-4 text-sm text-error">{error}</p>}<Button type="submit" className="mt-6 w-full" disabled={saving}>{saving ? 'Saving branch...' : 'Continue to POS'}</Button></form></div>;
}