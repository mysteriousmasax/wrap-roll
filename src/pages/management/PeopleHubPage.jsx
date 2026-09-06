import { useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import StaffListPage from './StaffListPage';
import StaffTrackingPage from '../hr/StaffTrackingPage';
import { CalendarDays, UserCog } from 'lucide-react';

const tabs = [
  { id: 'staff', label: 'Staff management', icon: UserCog },
  { id: 'hr', label: 'HR tracking', icon: CalendarDays },
];

export default function PeopleHubPage() {
  const [activeTab, setActiveTab] = useState('staff');

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="People Hub" subtitle="Manage staff access, shifts, attendance, tasks, and approvals in one workspace" />
      <Card className="mb-6 p-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setActiveTab(id)} className={'flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ' + (activeTab === id ? 'bg-primary text-white' : 'text-surface-on-variant hover:bg-surface-container-low')}>
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </Card>
      {activeTab === 'staff' ? <StaffListPage embedded /> : <StaffTrackingPage embedded />}
    </div>
  );
}
