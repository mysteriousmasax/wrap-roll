import { Minus, Plus } from 'lucide-react';

export default function QuantityToggle({ quantity, onIncrease, onDecrease, size = 'md' }) {
  const sizes = { sm: 'h-7', md: 'h-9' };
  const btnSize = { sm: 'w-7', md: 'w-9' };
  return (
    <div className={'inline-flex items-center bg-surface-container-low rounded-full ' + sizes[size]}>
      <button
        onClick={onDecrease}
        className={btnSize[size] + ' h-full rounded-full flex items-center justify-center hover:bg-surface-container text-primary transition-colors'}
      >
        <Minus size={14} />
      </button>
      <span className="w-8 text-center font-display font-bold text-sm">{quantity}</span>
      <button
        onClick={onIncrease}
        className={btnSize[size] + ' h-full rounded-full flex items-center justify-center bg-primary text-white hover:bg-primary-container transition-colors'}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}