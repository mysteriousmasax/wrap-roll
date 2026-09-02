import { formatCurrency } from '../../utils/format';
import Badge from './Badge';

export default function ProductCard({ item, onClick }) {
  return (
    <div
      onClick={() => onClick(item)}
      className="pos-product-card bg-white rounded-xl shadow-ambient hover:shadow-elevated transition-all cursor-pointer overflow-hidden active:scale-[0.98] group"
    >
      <div className="relative aspect-square bg-surface-container-low overflow-hidden product-card-media-wrap">
        <img
          src={item.image}
          alt={item.name}
          className="product-card-image w-full h-full object-cover transition-transform duration-300"
          loading="lazy"
          onError={(event) => { event.currentTarget.src = 'https://wrapandrolltz.com/uploads/photo_gallery/d706fc0ef56440dd131465fd75aae870.jpg'; }}
        />
        {item.popular && (
          <div className="absolute top-2 left-2">
            <Badge variant="yellow">Popular</Badge>
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-display font-semibold text-sm text-surface-on line-clamp-2 leading-tight">{item.name}</h3>
        <p className="text-xs text-surface-on-variant mt-0.5 line-clamp-1">{item.description}</p>
        <p className="font-display font-bold text-base text-primary mt-2">{formatCurrency(item.price)}</p>
      </div>
    </div>
  );
}