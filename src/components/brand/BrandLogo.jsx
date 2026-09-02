export default function BrandLogo({ className = '', variant = 'light' }) {
  return (
    <span className={`brand-logo brand-logo-${variant} ${className}`.trim()} role="img" aria-label="wrap and roll logo">
      <span className="brand-logo-art" />
    </span>
  );
}
