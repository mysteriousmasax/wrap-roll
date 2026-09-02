import Badge from './Badge';

const statusConfig = {
  pending: { variant: 'yellow', label: 'Pending' },
  preparing: { variant: 'orange', label: 'Preparing' },
  ready: { variant: 'green', label: 'Ready' },
  completed: { variant: 'green', label: 'Completed' },
  cancelled: { variant: 'red', label: 'Cancelled' },
  'on-clock': { variant: 'green', label: 'On Clock' },
  'off-clock': { variant: 'default', label: 'Off Clock' },
  'no-show': { variant: 'red', label: 'No Show' },
  available: { variant: 'green', label: 'Available' },
  occupied: { variant: 'red', label: 'Occupied' },
  reserved: { variant: 'yellow', label: 'Reserved' },
  cleaning: { variant: 'orange', label: 'Cleaning' },
  VIP: { variant: 'red', label: 'VIP' },
  Gold: { variant: 'yellow', label: 'Gold' },
  Regular: { variant: 'default', label: 'Regular' },
};

export default function StatusBadge({ status, className }) {
  const config = statusConfig[status] || { variant: 'default', label: status };
  return <Badge variant={config.variant} className={className}>{config.label}</Badge>;
}