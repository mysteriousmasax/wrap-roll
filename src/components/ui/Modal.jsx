import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';

export default function Modal({ isOpen, onClose, title, children, size = 'md', className }) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx('relative bg-white rounded-2xl shadow-elevated w-full max-h-[90vh] overflow-y-auto animate-slide-up', sizes[size], className)}>
        {title && (
          <div className="flex items-center justify-between p-5 border-b border-outline-variant sticky top-0 bg-white z-10">
            <h2 className="text-lg font-bold font-display">{title}</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}