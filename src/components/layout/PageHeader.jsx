export default function PageHeader({ title, subtitle, actions, mobileStack = false }) {
  const layoutClassName = mobileStack
    ? 'flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between'
    : 'flex items-center justify-between';

  return (
    <div className={`${layoutClassName} mb-6 min-w-0`} data-scroll-reveal>
      <div className={mobileStack ? 'min-w-0 w-full sm:w-auto' : ''}>
        <h1 className={`text-2xl font-display font-bold ${mobileStack ? 'break-words' : ''}`}>{title}</h1>
        {subtitle && <p className={`text-sm text-surface-on-variant mt-0.5 ${mobileStack ? 'break-words' : ''}`}>{subtitle}</p>}
      </div>
      {actions && <div className={`flex min-w-0 items-center gap-3 ${mobileStack ? 'w-full sm:w-auto' : ''}`}>{actions}</div>}
    </div>
  );
}