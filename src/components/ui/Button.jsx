import clsx from 'clsx';

export default function Button({ children, variant = 'primary', size = 'md', className, ...props }) {
  const base = 'font-display font-bold rounded-xl transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2';
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-5 py-2.5 text-sm', lg: 'px-8 py-3.5 text-base' };
  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-container shadow-sm',
    secondary: 'bg-white border-2 border-primary text-primary hover:bg-primary/5',
    yellow: 'bg-secondary-container text-secondary hover:brightness-95',
    whatsapp: 'bg-[#25D366] text-white hover:bg-[#1ebe5d] shadow-sm',
    ghost: 'text-surface-on hover:bg-surface-container',
    danger: 'bg-error text-white hover:bg-error/90',
  };
  return (
    <button className={clsx(base, sizes[size], variants[variant], className)} {...props}>
      {children}
    </button>
  );
}