import clsx from 'clsx';

export default function Input({ label, icon, className, error, ...props }) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-xs font-semibold text-surface-on-variant uppercase tracking-wide">{label}</label>}
      <div className="relative">
        {icon && <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">{icon}</span>}
        <input
          className={clsx(
            'input-field', icon && 'pl-10',
            error && 'border-error focus:border-error focus:ring-error/20',
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}