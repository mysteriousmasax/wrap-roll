import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import StatusBadge from '../../components/ui/StatusBadge';
import Button from '../../components/ui/Button';
import { api } from '../../api/client';
import { Users, Clock, AlertTriangle, UserCheck } from 'lucide-react';

export default function StaffTrackingPage() {
  const [staffMembers, setStaffMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => api.getStaff().then(setStaffMembers).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const toggleClock = async (staff) => {
    await api.clockStaff(staff.id, staff.status === 'on-clock' ? 'out' : 'in');
    load();
  };

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading staff...</div>;

  const onClock = staffMembers.filter((s) => s.status === 'on-clock');

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="HR Staff Tracking" subtitle="Real-time workforce monitoring and shift management" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Staff" value={staffMembers.length} icon={Users} iconColor="primary" />
        <StatCard title="On Clock" value={onClock.length} icon={UserCheck} iconColor="green" />
        <StatCard title="Off Clock" value={staffMembers.filter((s) => s.status === 'off-clock').length} icon={Clock} />
        <StatCard title="No Show" value={staffMembers.filter((s) => s.status === 'no-show').length} icon={AlertTriangle} iconColor="red" />
      </div>

      <Card>
        <h3 className="font-display font-bold text-sm mb-4">Shift Timeline - Today</h3>
        <div className="space-y-3">
          {staffMembers.map((staff) => (
            <div key={staff.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-surface-container-low">
              <div className={'w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ' +
                (staff.status === 'on-clock' ? 'bg-success/10 text-success ring-2 ring-success/30' : 'bg-surface-container text-surface-on-variant')}>
                {staff.avatar}
              </div>
              <div className="w-32">
                <p className="font-semibold text-sm">{staff.name}</p>
                <p className="text-xs text-surface-on-variant">{staff.role}</p>
              </div>
              <StatusBadge status={staff.status} />
              <div className="flex-1">
                <div className="bg-surface-container-low rounded-full h-3 overflow-hidden">
                  <div className={'h-full rounded-full ' + (staff.status === 'on-clock' ? 'bg-success' : staff.status === 'no-show' ? 'bg-error' : 'bg-outline-variant')}
                    style={{ width: staff.status === 'on-clock' ? '65%' : '0%' }} />
                </div>
              </div>
              <p className="text-xs text-surface-on-variant w-20">{staff.clockIn || '-'}</p>
              <Button variant="ghost" size="sm" onClick={() => toggleClock(staff)}>
                {staff.status === 'on-clock' ? 'Clock Out' : 'Clock In'}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
