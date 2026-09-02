import clsx from 'clsx';

export default function Badge({ children, variant = 'default', className }) {
  const variants = {
    default: 'bg-surface-container text-surface-on',
    red: 'bg-primary/10 text-primary',
    yellow: 'bg-secondary-container/30 text-secondary',
    green: 'bg-success/10 text-success',
    orange: 'bg-warning/10 text-warning',
    outline: 'border border-outline-variant text-surface-on-variant',
  };
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold', variants[variant], className)}>
      {children}
    </span>
  );
}