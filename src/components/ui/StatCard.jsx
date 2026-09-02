import { TrendingUp, TrendingDown } from 'lucide-react';
import clsx from 'clsx';

export default function StatCard({ title, value, change, icon: Icon, iconColor = 'primary', className }) {
  const isPositive = change >= 0;
  const iconBg = {
    primary: 'bg-primary/10 text-primary',
    yellow: 'bg-secondary-container/30 text-secondary',
    green: 'bg-success/10 text-success',
    red: 'bg-error/10 text-error',
  };

  return (
    <div className={clsx('dashboard-stat-card card', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-surface-on-variant uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-display font-bold mt-1">{value}</p>
          {change !== undefined && (
            <div className={clsx('flex items-center gap-1 mt-1 text-xs font-semibold', isPositive ? 'text-success' : 'text-error')}>
              {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              <span>{isPositive ? '+' : ''}{change}%</span>
              <span className="text-surface-on-variant font-normal">vs last period</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', iconBg[iconColor])}>
            <Icon size={20} />
          </div>
        )}
      </div>
    </div>
  );
}