import clsx from 'clsx';

export default function Card({ children, className, onClick, hover = true, ...props }) {
  return (
    <div
      className={clsx(
        'card bg-white rounded-xl shadow-ambient p-4',
        hover && 'hover:shadow-elevated transition-shadow cursor-pointer',
        className
      )}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
}