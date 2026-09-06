import { useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import BusinessOperationsPage from './BusinessOperationsPage';
import InventoryPage from './InventoryPage';
import { Package, WalletCards } from 'lucide-react';

const tabs = [
  { id: 'overview', label: 'Business operations', icon: WalletCards },
  { id: 'inventory', label: 'Inventory management', icon: Package },
];

export default function OperationsHubPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Operations Hub" subtitle="Manage business health, expenses, suppliers, and stock from one workspace" />
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
      {activeTab === 'overview' ? <BusinessOperationsPage embedded /> : <InventoryPage embedded />}
    </div>
  );
}
