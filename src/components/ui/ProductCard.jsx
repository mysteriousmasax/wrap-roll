import { formatCurrency } from '../../utils/format';
import Badge from './Badge';

const fallbackImage = 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&h=600&fit=crop';

function getImageSource(image) {
  if (typeof image !== 'string') return fallbackImage;
  const value = image.trim();
  return /^(https?:\/\/|\/|data:image\/(?:png|jpe?g|webp|gif);base64,)/i.test(value)
    ? value
    : fallbackImage;
}

export default function ProductCard({ item, onClick }) {
  return (
    <div
      onClick={() => onClick(item)}
      className="pos-product-card bg-white rounded-xl shadow-ambient hover:shadow-elevated transition-all cursor-pointer overflow-hidden active:scale-[0.98] group"
    >
      <div className="relative aspect-square bg-surface-container-low overflow-hidden product-card-media-wrap">
        <img
          src={getImageSource(item.image)}
          alt=""
          className="product-card-image w-full h-full object-cover transition-transform duration-300"
          loading="lazy"
          onError={(event) => { event.currentTarget.src = fallbackImage; }}
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