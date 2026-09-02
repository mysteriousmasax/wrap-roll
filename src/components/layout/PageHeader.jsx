export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-center justify-between mb-6" data-scroll-reveal>
      <div>
        <h1 className="text-2xl font-display font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-surface-on-variant mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}