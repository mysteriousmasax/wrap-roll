import { useEffect, useRef, useState } from 'react';
import { animate, stagger, splitText } from 'animejs';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  ChevronDown,
  Languages,
  LogIn,
  MapPin,
  Menu,
  ShoppingBag,
  X,
  Coins,
  Plus,
  Minus,
  Check,
  Utensils,
  Sparkles,
  Phone,
  Clock,
  Mail,
  MessageCircle,
  Instagram,
  Star,
} from 'lucide-react';
import { api } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';
import { formatCurrency, printFiscalInvoice } from '../../utils/format';
import BrandLogo from '../../components/brand/BrandLogo';
import useSettingsStore from '../../store/useSettingsStore';
import useTranslation from '../../i18n/useTranslation';
import CustomerChat from '../../components/public/CustomerChat';
import LipaPaymentModal from '../../components/public/LipaPaymentModal';
import RoadsideTrackingPanel from '../../components/public/RoadsideTrackingPanel';
import RotatingText from '../../components/ui/RotatingText';
import DepthText from '../../components/ui/DepthText';
import { reverseGoogleGeocode } from '../../lib/googleMaps';
import { groupLegacyMenuVariants, isMenuVariantCategory } from '../../utils/menuProductVariants';

const defaultCategories = [
  { key: 'allMenu', filter: 'all', label: 'All Menu' },
  { key: 'wraps', filter: 'wraps', label: 'Wraps' },
  { key: 'salads', filter: 'salads', label: 'Salads' },
  { key: 'rolls', filter: 'rolls', label: 'Rolls' },
  { key: 'pizzas', filter: 'pizzas', label: 'Pizzas' },
  { key: 'burgers', filter: 'burgers', label: 'Burgers' },
  { key: 'combos', filter: 'combos', label: 'Combos & Meals' },
  { key: 'sides', filter: 'extras', label: 'Sides & Extras' },
  { key: 'coffee', filter: 'coffee', label: 'Coffee' },
  { key: 'coldDrinks', filter: 'cold-drinks', label: 'Cold Drinks' },
  { key: 'softDrinks', filter: 'soft-drinks', label: 'Soft Drinks' },
];

const brandFoodImages = [
  'https://wrapandrolltz.com/uploads/banner_section/08228d971ba94c79229271c56a738ca5.jpg',
  'https://wrapandrolltz.com/uploads/photo_gallery/d706fc0ef56440dd131465fd75aae870.jpg',
  'https://wrapandrolltz.com/uploads/photo_gallery/c24c7b3e15ad597021def8b940058a69.jpg',
  'https://wrapandrolltz.com/uploads/photo_gallery/01deca3b2de50c4ffbc3e6a67bc89c25.jpg',
  'https://wrapandrolltz.com/uploads/photo_gallery/7f216e751ec3d742964c664e58fd487d.jpg',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eecd?w=900&h=1100&fit=crop',
  'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=900&h=1100&fit=crop',
  'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=900&h=1100&fit=crop',
  'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=900&h=1100&fit=crop',
  'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=900&h=1100&fit=crop',
];
const localCategoryImages = ['/hero-food.jpg', '/delivery-wraps.jpg', '/craft-story.jpg'];

const restaurantLocation = {
  label: 'Wikicha Tower, Mwai Kibaki Road',
  mapsUrl: 'https://maps.app.goo.gl/gZqwfknocNK6FYNAA',
};

function OrderTrackingCard({ order, onOpenPayment, onPrintInvoice, now, settings }) {
  const elapsedEnd = order.status === 'completed'
    ? new Date(order.completedAt || order.updatedAt || now).getTime()
    : now;
  const elapsedSeconds = Math.max(0, Math.floor((elapsedEnd - new Date(order.createdAt).getTime()) / 1000));
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const remainingSeconds = elapsedSeconds % 60;
  const paymentLabel = order.paymentStatus === 'paid' ? 'Payment confirmed' : order.paymentStatus === 'manual_review' ? 'Payment submitted for review' : order.paymentStatus === 'failed' ? 'Payment not approved' : 'Waiting for payment';
  const kitchenLabel = order.status === 'confirmed' ? 'Confirmed and sent to kitchen' : order.status === 'preparing' ? 'Being prepared' : order.status === 'ready' ? 'Ready for collection' : order.status === 'completed' ? 'Completed' : 'Waiting for payment confirmation';
  const isPaid = order.paymentStatus === 'paid';

  // Estimated ready time from the slowest item prep time (default 15 min) plus a small buffer.
  const prepSource = (order.items || []).map((item) => Number(item.prepTimeMinutes ?? item.prep_time_minutes ?? 15));
  const prepMinutes = Math.max(15, ...prepSource);
  const etaMinutes = prepMinutes + 5;
  const overdue = order.status !== 'completed' && order.status !== 'ready' && elapsedMinutes >= etaMinutes;
  const remainingMinutes = Math.max(0, etaMinutes - elapsedMinutes);

  const reviewLinks = [
    { key: 'review_whatsapp_url', label: 'WhatsApp', icon: MessageCircle },
    { key: 'review_instagram_url', label: 'Instagram', icon: Instagram },
    { key: 'review_google_url', label: 'Google review', icon: Star },
  ].filter(({ key }) => settings?.[key]);

  return (
    <div className="reference-delivery-card order-tracking-card">
      <div className="order-tracking-visual">
        <div className="order-tracking-orbit" />
        <Clock size={42} />
        <span>{elapsedMinutes} min {String(remainingSeconds).padStart(2, '0')} sec</span>
        <small>time elapsed</small>
      </div>
      <div className="reference-delivery-copy order-tracking-copy">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#ffc72c]">Live order tracker</span>
        <h2>{order.orderNumber || order.id}</h2>

        {/* Estimated ready time / timeout state */}
        {order.status !== 'completed' && (
          <p className={'order-tracking-eta ' + (overdue ? 'order-tracking-eta-overdue' : '')}>
            {order.status === 'ready'
              ? 'Ready now — please collect your order.'
              : overdue
                ? 'Taking longer than expected. Please check with our staff — your order matters to us.'
                : `Estimated ready in about ${remainingMinutes} min (around ${new Date(new Date(order.createdAt).getTime() + etaMinutes * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`}
          </p>
        )}

        <div className="order-tracking-statuses">
          <p><span className={isPaid ? 'status-dot status-dot-paid' : 'status-dot'} />{paymentLabel}</p>
          <p><span className={order.status === 'confirmed' || order.status === 'preparing' || order.status === 'ready' ? 'status-dot status-dot-paid' : 'status-dot'} />{kitchenLabel}</p>
        </div>
        {order.paymentStatus === 'failed' && (
          <div className="order-review-panel border-rose-200 bg-rose-50">
            <strong className="text-rose-800">Payment not approved</strong>
            <span className="text-rose-800">{order.paymentFailureReason || 'The restaurant could not verify this payment. Review the payment details or contact staff with your order reference.'}</span>
          </div>
        )}
        {order.status === 'completed' && reviewLinks.length > 0 && (
          <div className="order-review-panel">
            <strong>Rate your meal</strong>
            <span>Tell us how we did.</span>
            <div className="order-review-links">
              {reviewLinks.map(({ key, label, icon: Icon }) => (
                <a key={key} href={settings[key]} target="_blank" rel="noreferrer">
                  <Icon size={15} /> {label}
                </a>
              ))}
            </div>
          </div>
        )}
        <div className="order-tracking-actions">
          <button type="button" onClick={onOpenPayment}>VIEW PAYMENT &amp; ORDER DETAILS</button>
          {isPaid && onPrintInvoice && (
            <button type="button" className="order-invoice-btn" onClick={onPrintInvoice}>VIEW / PRINT INVOICE</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { tagId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const heroHeadingRef = useRef(null);
  const menuHeadingRef = useRef(null);
  const reorderedFavoriteRef = useRef('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [language, setLanguage] = useState(() => localStorage.getItem('wraproll_language') || 'English');
  const [displayCurrency, setDisplayCurrency] = useState(
    () => localStorage.getItem('wraproll_display_currency') || 'TZS'
  );
  const t = useTranslation(language);
  const [outlet, setOutlet] = useState(restaurantLocation.label);
  const [cartItems, setCartItems] = useState(() =>
    JSON.parse(localStorage.getItem('wraproll_public_cart') || '[]')
  );
  const [cartOpen, setCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState(() => localStorage.getItem('wraproll_customer_name') || '');
  const [customerPhone, setCustomerPhone] = useState(
    () => localStorage.getItem('wraproll_customer_phone') || ''
  );
  const [customerEmail, setCustomerEmail] = useState(
    () => localStorage.getItem('wraproll_customer_email') || ''
  );
  const [rememberedCustomer, setRememberedCustomer] = useState(null);
  const [reorderNotice, setReorderNotice] = useState('');
  const [customerType, setCustomerType] = useState('individual');
  const [companyName, setCompanyName] = useState('');
  const [customerTin, setCustomerTin] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [emailMarketingConsent, setEmailMarketingConsent] = useState(false);
  const [companyInvoiceTerms, setCompanyInvoiceTerms] = useState(false);

  useEffect(() => {
    const targets = [heroHeadingRef.current, menuHeadingRef.current].filter(Boolean);
    targets.forEach((element) => {
      const { chars } = splitText(element, { words: false, chars: true, trim: false });
      animate(chars, {
        y: [
          { to: '-0.6rem', ease: 'outExpo', duration: 420 },
          { to: 0, ease: 'outBounce', duration: 660, delay: 80 },
          { to: 0, ease: 'linear', duration: 1200 }
        ],
        rotate: [0, 3, -3, 0],
        opacity: [1, 1],
        delay: stagger(28),
        loop: true,
        duration: 1500,
        easing: 'easeInOutSine',
      });
    });
  }, []);
  const [paymentReference, setPaymentReference] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCoordinates, setDeliveryCoordinates] = useState({ latitude: null, longitude: null });
  const [fulfillmentMode, setFulfillmentMode] = useState('standard');
  const [scheduledFor, setScheduledFor] = useState('');
  const [roadsideAccessToken, setRoadsideAccessToken] = useState('');
  const [locating, setLocating] = useState(false);
  const [orderStatus, setOrderStatus] = useState('');
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [activePlacedOrder, setActivePlacedOrder] = useState(null);
  const [trackingNow, setTrackingNow] = useState(Date.now());
  const [publicMenu, setPublicMenu] = useState([]);
  const [publicModifiers, setPublicModifiers] = useState([]);
  const [menuCategories, setMenuCategories] = useState([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [tableContext, setTableContext] = useState(null);
  const [selectedMealItem, setSelectedMealItem] = useState(null);
  const [selectedMealVariant, setSelectedMealVariant] = useState(null);
  const [mealQuantity, setMealQuantity] = useState(1);
  const [mealInstructions, setMealInstructions] = useState('');
  const [mealModifiers, setMealModifiers] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');

  const publicSettings = useSettingsStore((state) => state.settings);

  const cartCount = cartItems.reduce((sum, item) => sum + item.qty, 0);
  const cartSubtotal = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const taxRateValue = Number.parseFloat(String(publicSettings?.tax_rate ?? 0));
  const cartTax = Number.isFinite(taxRateValue) && taxRateValue > 0 ? cartSubtotal * (taxRateValue / 100) : 0;

  useEffect(() => {
    if (!activePlacedOrder?.id) return undefined;
    const refreshOrder = async () => {
      try {
        const status = await api.getPaymentStatus(activePlacedOrder.paymentReference || `WRPAY-${activePlacedOrder.id.replace(/^WR-/, '')}`);
        if (status.success) {
          setActivePlacedOrder((current) => ({
            ...current,
            paymentStatus: status.status,
            status: status.orderStatus,
            paymentFailureReason: status.status === 'failed' ? status.notes || current.paymentFailureReason : current.paymentFailureReason,
            paidAt: status.paidAt,
            updatedAt: status.updatedAt || current.updatedAt,
            completedAt: status.orderStatus === 'completed' && current.status !== 'completed'
              ? Date.now()
              : current.completedAt,
          }));
        }
      } catch {
        // Keep the last visible order state while the API is unavailable.
      }
    };
    refreshOrder();
    const interval = window.setInterval(refreshOrder, 8000);
    return () => window.clearInterval(interval);
  }, [activePlacedOrder?.id, activePlacedOrder?.paymentReference]);

  useEffect(() => {
    if (!activePlacedOrder) return undefined;
    const interval = window.setInterval(() => setTrackingNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activePlacedOrder]);

  // Invoice is generated on demand via the "View / Print invoice" action in the
  // order tracker, instead of auto-opening a disruptive print dialog on payment.

  const dynamicCategories = Array.from(new Set([
    ...defaultCategories.map((entry) => entry.filter),
    ...menuCategories.map((entry) => String(entry.slug || entry.name || '').trim()).filter((category) => category && !isMenuVariantCategory(category)),
    ...publicMenu.flatMap((item) => Array.isArray(item.categories) ? item.categories : [item.category]).filter((category) => category && !isMenuVariantCategory(category)),
  ])).map((filter) => {
    const match = [...defaultCategories, ...menuCategories.map((entry) => ({ filter: String(entry.slug || entry.name || '').trim(), label: entry.name || entry.slug || 'Menu' }))]
      .find((category) => category.filter === filter);

    if (!match) {
      return { key: String(filter), filter, label: String(filter).replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) };
    }

    return { key: match.key || String(filter), filter, label: match.label || String(filter).replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) };
  });

  const categories = [{ key: 'allMenu', filter: 'all', label: 'All Menu' }, ...dynamicCategories.filter((entry) => entry.filter !== 'all')];

  const menuByCategory = categories.reduce((acc, cat) => {
    const items = publicMenu.filter((item) => {
      const itemCategories = Array.isArray(item.categories) ? item.categories : [item.category].filter(Boolean);
      return cat.filter === 'all' || itemCategories.includes(cat.filter) || item.category === cat.filter;
    });
    if (items.length > 0) acc[cat.filter] = { ...cat, items };
    return acc;
  }, {});

  useEffect(() => {
    let active = true;
    const refreshMenu = () => Promise.allSettled([api.getPublicMenu(), api.getPublicModifiers(), api.getMenuCategories()])
      .then(([menuResult, modifiersResult, categoriesResult]) => {
        if (!active) return;
        if (menuResult.status === 'fulfilled') setPublicMenu(groupLegacyMenuVariants(menuResult.value || []));
        if (modifiersResult.status === 'fulfilled') setPublicModifiers(modifiersResult.value || []);
        if (categoriesResult.status === 'fulfilled') setMenuCategories(categoriesResult.value || []);
      })
      .finally(() => {
        if (active) setMenuLoading(false);
      });

    refreshMenu();
    return () => {
      active = false;
    };
  }, []);

  useWebSocket((event) => {
    if (event !== 'menu:updated') return;
    Promise.allSettled([api.getPublicMenu(), api.getPublicModifiers(), api.getMenuCategories()])
      .then(([menuResult, modifiersResult, categoriesResult]) => {
        if (menuResult.status === 'fulfilled') setPublicMenu(groupLegacyMenuVariants(menuResult.value || []));
        if (modifiersResult.status === 'fulfilled') setPublicModifiers(modifiersResult.value || []);
        if (categoriesResult.status === 'fulfilled') setMenuCategories(categoriesResult.value || []);
      })
      .catch(() => {});
  });

  useEffect(() => {
    if (!tagId) return undefined;
    api.getPublicTable(tagId).then(setTableContext).catch(() => setTableContext(null));
    return undefined;
  }, [tagId]);

  useEffect(() => {
    if (tableContext) setDeliveryAddress(`Dine-in at Table ${tableContext.number}`);
  }, [tableContext]);

  useEffect(() => {
    localStorage.setItem('wraproll_public_cart', JSON.stringify(cartItems));
  }, [cartItems]);
  useEffect(() => {
    localStorage.setItem('wraproll_customer_name', customerName);
  }, [customerName]);
  useEffect(() => {
    localStorage.setItem('wraproll_customer_phone', customerPhone);
  }, [customerPhone]);
  useEffect(() => {
    localStorage.setItem('wraproll_customer_email', customerEmail);
  }, [customerEmail]);
  useEffect(() => {
    localStorage.setItem('wraproll_language', language);
  }, [language]);
  useEffect(() => {
    localStorage.setItem('wraproll_display_currency', displayCurrency);
  }, [displayCurrency]);

  useEffect(() => {
    const sessionToken = localStorage.getItem('wraproll_customer_session');
    if (!sessionToken) {
      setRememberedCustomer(null);
      return undefined;
    }
    let active = true;
    api.getPublicCustomerSession(sessionToken).then((customer) => {
      if (!active) return;
      setRememberedCustomer(customer);
      setCustomerName((current) => current || customer.name || '');
      setCustomerPhone((current) => current || customer.phone || '');
      setCustomerEmail((current) => current || customer.email || '');
    }).catch(() => {
      localStorage.removeItem('wraproll_customer_session');
      if (active) setRememberedCustomer(null);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!activePlacedOrder?.id || !['paid', 'completed'].includes(activePlacedOrder.paymentStatus)) return;
    const sessionToken = localStorage.getItem('wraproll_customer_session');
    if (!sessionToken) return;
    let active = true;
    api.getPublicCustomerSession(sessionToken)
      .then((customer) => { if (active) setRememberedCustomer(customer); })
      .catch(() => {});
    return () => { active = false; };
  }, [activePlacedOrder?.id, activePlacedOrder?.paymentStatus]);

  const scrollTo = (id) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    if (window.location.hash !== `#${id}`) {
      window.history.pushState({}, '', `#${id}`);
    }
  };

  const openCartLink = () => {
    setCartOpen(true);
    setMobileMenuOpen(false);
  };

  const openMealCustomizer = (item) => {
    setSelectedMealItem(item);
    setSelectedMealVariant(item.variants?.[0] || null);
    setMealQuantity(1);
    setMealInstructions('');
    setMealModifiers([]);
  };

  const addCustomizedMealToCart = () => {
    if (!selectedMealItem) return;
    if (selectedMealItem.variants?.length && !selectedMealVariant) return;
    const variantName = selectedMealVariant?.name || '';
    const selectedModifiersKey = JSON.stringify(mealModifiers.map((modifier) => modifier.id).sort());
    setCartItems((items) => {
      const existing = items.find((cartItem) => cartItem.id === selectedMealItem.id
        && (cartItem.variantName || '') === variantName
        && JSON.stringify((cartItem.modifiers || []).map((modifier) => modifier.id).sort()) === selectedModifiersKey
        && (cartItem.instructions || '') === mealInstructions);
      if (existing) {
        return items.map((cartItem) =>
          cartItem.cartId === existing.cartId
            ? { ...cartItem, qty: cartItem.qty + mealQuantity, instructions: mealInstructions }
            : cartItem
        );
      }
      return [
        ...items,
        {
          id: selectedMealItem.id,
          cartId: `${selectedMealItem.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: selectedMealVariant ? `${selectedMealItem.name} (${selectedMealVariant.name})` : selectedMealItem.name,
          description: selectedMealItem.description,
          image: selectedMealItem.image,
          price: (selectedMealVariant?.price ?? selectedMealItem.price) + mealModifiers.reduce((sum, modifier) => sum + Number(modifier.price || 0), 0),
          variantName,
          variantMenuItemId: selectedMealVariant?.menuItemId || null,
          qty: mealQuantity,
          modifiers: mealModifiers,
          instructions: mealInstructions,
        },
      ];
    });
    setSelectedMealItem(null);
    setCartOpen(true);
  };

  const quickAddToCart = (item) => {
    if (item.variants?.length) {
      openMealCustomizer(item);
      return;
    }
    setCartItems((items) => {
      const existing = items.find((cartItem) => cartItem.id === item.id);
      if (existing) {
        return items.map((cartItem) =>
          cartItem.id === item.id ? { ...cartItem, qty: cartItem.qty + 1 } : cartItem
        );
      }
      return [
        ...items,
        {
          id: item.id,
          cartId: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: item.name,
          description: item.description,
          image: item.image,
          price: item.price,
          qty: 1,
        },
      ];
    });
  };

  const addFavoriteOrderToCart = (order) => {
    const cartRows = (order.items || []).flatMap((savedItem, index) => {
      let product = publicMenu.find((item) => String(item.id) === String(savedItem.menuItemId));
      let variant = product?.variants?.find((entry) => String(entry.menuItemId) === String(savedItem.menuItemId));

      if (!product) {
        product = publicMenu.find((item) => item.variants?.some((entry) => String(entry.menuItemId) === String(savedItem.menuItemId)));
        variant = product?.variants?.find((entry) => String(entry.menuItemId) === String(savedItem.menuItemId));
      }

      if (!product && savedItem.name) {
        const savedName = savedItem.name.trim().toLowerCase();
        product = publicMenu.find((item) => item.name.trim().toLowerCase() === savedName
          || item.variants?.some((entry) => `${item.name} (${entry.name})`.trim().toLowerCase() === savedName));
        variant = product?.variants?.find((entry) => `${product.name} (${entry.name})`.trim().toLowerCase() === savedName);
      }
      if (product && !variant && savedItem.name && product.variants?.length) {
        const savedName = savedItem.name.trim().toLowerCase();
        variant = product.variants.find((entry) => `${product.name} (${entry.name})`.trim().toLowerCase() === savedName);
      }
      if (!product) return [];

      const modifierNames = (savedItem.modifiers || []).map((modifier) => typeof modifier === 'string' ? modifier : modifier.name).filter(Boolean);
      const modifiers = modifierNames.map((name) => publicModifiers.find((modifier) => modifier.name === name)).filter(Boolean);
      if (modifiers.length !== modifierNames.length) return [];

      return [{
        id: product.id,
        cartId: `favorite-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
        name: variant ? `${product.name} (${variant.name})` : product.name,
        description: product.description,
        image: product.image,
        price: Number(variant?.price ?? product.price) + modifiers.reduce((sum, modifier) => sum + (modifier.type === 'add' ? Number(modifier.price || 0) : 0), 0),
        variantName: variant?.name || '',
        variantMenuItemId: variant?.menuItemId || null,
        modifiers,
        qty: Math.max(1, Number(savedItem.qty) || 1),
        instructions: savedItem.specialInstructions || '',
      }];
    });

    if (!cartRows.length) {
      setReorderNotice('Those saved dishes or add-ons are no longer available.');
      return;
    }

    setCartItems((currentItems) => {
      const nextItems = [...currentItems];
      cartRows.forEach((row) => {
        const modifierKey = (modifiers) => JSON.stringify((modifiers || []).map((modifier) => typeof modifier === 'string' ? modifier : modifier.name).sort());
        const existing = nextItems.find((item) => item.id === row.id
          && (item.variantName || '') === row.variantName
          && modifierKey(item.modifiers) === modifierKey(row.modifiers)
          && (item.instructions || '') === row.instructions);
        if (existing) {
          nextItems.splice(nextItems.indexOf(existing), 1, { ...existing, qty: existing.qty + row.qty });
        } else {
          nextItems.push(row);
        }
      });
      return nextItems;
    });
    setReorderNotice('Your usual order is back in the cart.');
    setCartOpen(true);
  };

  useEffect(() => {
    const favoriteOrder = location.state?.favoriteOrder;
    if (!favoriteOrder || menuLoading || !publicMenu.length) return;
    const requestKey = `${favoriteOrder.createdAt || ''}:${favoriteOrder.items?.map((item) => item.menuItemId).join(',') || ''}`;
    if (reorderedFavoriteRef.current === requestKey) return;
    reorderedFavoriteRef.current = requestKey;
    addFavoriteOrderToCart(favoriteOrder);
    navigate('/', { replace: true, state: null });
  }, [location.state, menuLoading, publicMenu]);

  const changeQuantity = (cartId, quantity) => {
    setCartItems((items) =>
      items
        .map((item) => ((item.cartId || item.id) === cartId ? { ...item, qty: quantity } : item))
        .filter((item) => item.qty > 0)
    );
  };

  const submitOrder = async (event) => {
    event.preventDefault();
    if (!cartItems.length) return setOrderStatus('Add a dish before checking out.');
    if (!customerName.trim()) return setOrderStatus('Please enter your full name.');
    if (!customerPhone.trim()) return setOrderStatus('Please enter your phone number so we can confirm your order.');
    if (!tableContext && fulfillmentMode !== 'roadside_handoff' && !deliveryAddress.trim()) return setOrderStatus('Please enter a delivery address or table number.');
    if (customerType === 'company' && (!companyName.trim() || !customerTin.trim())) return setOrderStatus('Company name and TIN are required for a company invoice.');
    setOrderStatus('Sending your order...');
    try {
      const order = await api.createPublicOrder({
        items: cartItems.map((item) => ({
          menuItemId: item.id,
          variantName: item.variantMenuItemId ? undefined : (item.variantName || undefined),
          qty: item.qty,
          modifiers: item.modifiers || [],
          specialInstructions: item.instructions || undefined,
        })),
        customerName,
        customerPhone,
        customerEmail,
        customerType,
        companyName,
        customerTin,
        billingAddress,
        deliveryAddress: tableContext || fulfillmentMode === 'roadside_handoff' ? '' : deliveryAddress,
        deliveryLatitude: tableContext ? null : deliveryCoordinates.latitude,
        deliveryLongitude: tableContext ? null : deliveryCoordinates.longitude,
        orderType: tableContext ? 'dine-in' : fulfillmentMode === 'roadside_handoff' ? 'takeout' : 'delivery',
        tableNumber: tableContext?.number || null,
        fulfillmentMode: tableContext ? 'standard' : fulfillmentMode,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
        paymentTerms: customerType === 'company' && companyInvoiceTerms ? 'invoice' : 'prepaid',
        orderSource: tableContext ? 'nfc' : 'website',
        paymentReference: paymentReference || undefined,
      });
      setRoadsideAccessToken(order.roadsideAccessToken || '');
      if (order.roadsideAccessToken) sessionStorage.setItem(`wraproll_roadside_access_${order.id}`, order.roadsideAccessToken);
      const subscribeForEmailUpdates = emailMarketingConsent && customerEmail.trim();
      setActivePlacedOrder(order);
      const companyInvoiceOrder = order.paymentTerms === 'invoice' && order.reservationStatus === 'confirmed';
      setPaymentModalOpen(!companyInvoiceOrder);
      // Clear the cart (state + persisted copy) so ordered items never linger.
      setCartItems([]);
      localStorage.removeItem('wraproll_public_cart');
      setCartOpen(false);
      setEmailMarketingConsent(false);
      setCustomerType('individual');
      setCompanyName('');
      setCustomerTin('');
      setBillingAddress('');
      setCompanyInvoiceTerms(false);
      setFulfillmentMode('standard');
      setScheduledFor('');
      setOrderStatus('');
      if (companyInvoiceOrder) setOrderStatus('Company order received. We will email the invoice and fulfillment updates.');
      if (subscribeForEmailUpdates) {
        api.subscribeToEmailMarketing({
            email: customerEmail,
            firstName: customerName.trim().split(/\s+/)[0] || '',
            lastName: customerName.trim().split(/\s+/).slice(1).join(' '),
            marketingConsent: true,
            source: 'website_checkout',
          }).then(() => setOrderStatus('Check your email to confirm marketing updates.'))
          .catch((subscriptionError) => setOrderStatus(`Your order is safe. Email signup could not be completed: ${subscriptionError.message}`));
      }
    } catch (error) {
      setOrderStatus(error.message || 'We could not send that order.');
    }
  };

  const useCustomerLocation = () => {
    if (!navigator.geolocation) {
      setOrderStatus('Location is not available in this browser. Enter your address instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const coordinateAddress = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
        try {
          const result = await reverseGoogleGeocode(coords.latitude, coords.longitude);
          setDeliveryAddress(result.address || coordinateAddress);
          setDeliveryCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
        } catch {
          setDeliveryAddress(coordinateAddress);
          setDeliveryCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setOrderStatus('Location permission was not granted. Enter your address instead.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  };

  return (
    <main className="public-site bg-[#faf7f2] text-[#24211e] min-h-screen">
      {/* Header */}
      <header className="public-header sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#eee4d5] px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-sm">
        <a className="brand-mark flex items-center" href="/" aria-label="Wrap and Roll home">
          <BrandLogo />
        </a>

        <button
          className="mobile-menu-button md:hidden p-2 rounded-xl text-[#ae002a] hover:bg-[#faeee2]"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        {mobileMenuOpen && (
          <div
            className="mobile-nav-backdrop fixed inset-0 z-20 bg-black/30 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        <nav className={mobileMenuOpen ? 'public-nav is-open' : 'public-nav'}>
          <a href="#home" onClick={() => setMobileMenuOpen(false)}>{t('home')}</a>
          <a href="#story" onClick={() => setMobileMenuOpen(false)}>{t('about')}</a>
          <a href="#menu" onClick={() => setMobileMenuOpen(false)}>{t('orderOnline')}</a>
          <a href="#visit" onClick={() => setMobileMenuOpen(false)}>{t('reservation')}</a>
          <a href="#contact" onClick={() => setMobileMenuOpen(false)}>{t('contact')}</a>

          <button
            type="button"
            className="header-utility relative flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#faeee2] text-[#ae002a] font-bold text-xs hover:bg-[#f8e0cd] transition-colors"
            onClick={() => setCartOpen(true)}
            aria-label={`${t('cart')} with ${cartCount} items`}
          >
            <ShoppingBag size={16} />
            {cartCount > 0 && (
              <span className="bg-[#ae002a] text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">
                {cartCount}
              </span>
            )}
            <span>{t('cart')}</span>
          </button>

          <div className="header-menu-wrap">
            <button
              className="header-utility language-button"
              onClick={() => {
                setLanguageOpen((open) => !open);
                setCurrencyOpen(false);
              }}
              aria-label="Language selector"
              aria-expanded={languageOpen}
            >
              <Languages size={15} />
              <span>{language}</span>
              <ChevronDown size={13} />
            </button>
            {languageOpen && (
              <div className="header-menu">
                <button
                  onClick={() => {
                    setLanguage('English');
                    setLanguageOpen(false);
                  }}
                >
                  English
                </button>
                <button
                  onClick={() => {
                    setLanguage('Swahili');
                    setLanguageOpen(false);
                  }}
                >
                  Swahili
                </button>
              </div>
            )}
          </div>

          <div className="header-menu-wrap">
            <button
              className="header-utility language-button"
              onClick={() => {
                setCurrencyOpen((open) => !open);
                setLanguageOpen(false);
              }}
              aria-label="Currency selector"
              aria-expanded={currencyOpen}
            >
              <Coins size={15} />
              <span>{displayCurrency}</span>
              <ChevronDown size={13} />
            </button>
            {currencyOpen && (
              <div className="header-menu">
                <button
                  onClick={() => {
                    setDisplayCurrency('TZS');
                    setCurrencyOpen(false);
                  }}
                >
                  TZS (TSh)
                </button>
                <button
                  onClick={() => {
                    setDisplayCurrency('USD');
                    setCurrencyOpen(false);
                  }}
                >
                  USD ($)
                </button>
                <button
                  onClick={() => {
                    setDisplayCurrency('KES');
                    setCurrencyOpen(false);
                  }}
                >
                  KES (KSh)
                </button>
              </div>
            )}
          </div>

          <a
            className="header-utility flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#ebdccb] text-[#554e46] font-semibold text-xs hover:bg-[#faeee2]"
            href="/login"
          >
            <LogIn size={15} />
            <span>Staff Login</span>
          </a>
        </nav>
      </header>

      {/* Table NFC Order Notice */}
      {tagId && (
        <div className="bg-[#ae002a] text-white px-4 py-2.5 text-center text-xs sm:text-sm font-bold shadow-md">
          {tableContext
            ? `Table Order Active: Table ${tableContext.number} · ${tableContext.zone}`
            : 'Table tag connected. Place your order below.'}
        </div>
      )}

      {/* Hero Section */}
      <section className="reference-home-hero hero-tablet w-full px-6 sm:px-12 flex items-center justify-start" id="home" style={{backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.62) 43%, rgba(0,0,0,0.08) 82%), url(/hero-food.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'scroll'}}>
        <div className="hero-copy reference-hero-copy space-y-5 max-w-xl">
          <a
            href="/customer-rewards"
            className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full bg-[#fde8d7] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#ae002a] transition-colors hover:bg-white"
            aria-label={rememberedCustomer ? `${rememberedCustomer.rollPoints} Roll Points. Open rewards.` : 'Open Roll Points rewards.'}
          >
            <Sparkles size={14} className="text-[#e6ac29]" />
            <span>{rememberedCustomer ? 'Your Roll Points' : 'Join Roll Points'}</span>
            {rememberedCustomer && <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black normal-case">{rememberedCustomer.rollPoints} Roll Points</span>}
          </a>
          <h1 ref={heroHeadingRef} className="reference-hero-heading hero-heading-animation text-4xl sm:text-6xl font-bold font-display leading-[1.02] tracking-tight">
            <span className="hero-heading-line">Dine with Delight at</span>{' '}
            <DepthText text="Wrap & Roll" faceColor="#e00000" depthColor="#8f001c" fontWeight="800" className="reference-depth-accent" />
          </h1>
          <p className="hero-intro reference-hero-intro text-base sm:text-lg leading-relaxed max-w-lg">
            Satisfy your cravings with delicious meals at Wrap &amp; Roll. Whether you&apos;re here for a quick bite or a special celebration.
          </p>

          <div className="hero-actions flex flex-wrap items-center gap-3 pt-2">
            <button
              className="px-6 py-3.5 rounded-2xl bg-[#ae002a] hover:bg-[#920023] text-white font-bold text-sm shadow-md transition-transform active:scale-[0.98] inline-flex items-center gap-2"
              onClick={() => scrollTo('menu')}
            >
              Explore Our Menu <ArrowRight size={17} />
            </button>
            <button
              className="hidden tablet:inline-flex px-6 py-3.5 rounded-2xl bg-[#faeee2] hover:bg-[#f6e0cd] text-[#ae002a] font-bold text-sm transition-colors items-center gap-2 border border-[#ebdccb]"
              onClick={() => scrollTo('visit')}
            >
              <MapPin size={16} /> Find Location
            </button>
          </div>
        </div>

      </section>

      {rememberedCustomer && (
        <section className="px-6 pb-8 sm:px-12" aria-label="Your saved favorites">
          <div className="mx-auto max-w-7xl border-y border-[#eadfd2] py-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ae002a]">Welcome back, {rememberedCustomer.name.split(' ')[0]}</p>
                <h2 className="mt-1 text-lg font-black text-[#1f1d1b]">Shall we make your usual?</h2>
              </div>
              <a href="/customer-rewards" className="text-xs font-bold text-[#ae002a] hover:underline">{rememberedCustomer.rollPoints} Roll Points</a>
            </div>
            {reorderNotice && <p className="mt-2 text-xs font-semibold text-[#227653]" role="status">{reorderNotice}</p>}
            {rememberedCustomer.favoriteOrders?.length ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {rememberedCustomer.favoriteOrders.slice(0, 2).map((order, index) => (
                  <div key={`${order.createdAt}-${index}`} className="flex flex-col justify-between gap-3 rounded-xl border border-[#eadfd2] bg-white p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1f1d1b]">{order.items.map((item) => `${item.qty} × ${item.name}`).join(' · ')}</p>
                      <p className="mt-1 text-[10px] text-[#746e67]">Last ordered {new Date(order.createdAt).toLocaleDateString()}</p>
                    </div>
                    <button type="button" onClick={() => addFavoriteOrderToCart(order)} className="min-h-10 shrink-0 rounded-xl bg-[#ae002a] px-4 py-2 text-xs font-bold text-white hover:bg-[#920023]">Add to cart</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-[#746e67]">Your paid orders will appear here as quick reorders.</p>
            )}
          </div>
        </section>
      )}

      <section className="reference-delivery-section public-reveal-section px-6 pb-14 pt-0 sm:px-12 sm:pb-20" aria-label="Delivery and catering">
        {activePlacedOrder ? (
          <OrderTrackingCard order={activePlacedOrder} now={trackingNow} settings={publicSettings} onOpenPayment={() => setPaymentModalOpen(true)} onPrintInvoice={() => printFiscalInvoice(activePlacedOrder, publicSettings)} />
        ) : (
          <div className="reference-delivery-card">
            <div className="reference-delivery-visual" aria-hidden="true" />
            <div className="reference-delivery-copy">
              <BrandLogo variant="dark" />
              <h2>DELIVERY &amp; CATERING</h2>
              <p>Freshness brought to your doorstep.<br />Perfect for meetings, events, or a cozy night in!</p>
              <button type="button" onClick={() => scrollTo('menu')}>ORDER NOW</button>
            </div>
          </div>
        )}
      </section>

      {/* Story Section */}
      <section className="story-section public-reveal-section py-16 px-6 sm:px-12 max-w-7xl mx-auto border-t border-[#eee4d5]" id="story">
        <div className="grid grid-cols-1 tablet:grid-cols-2 lg:grid-cols-2 gap-10 items-center">
          <div className="relative overflow-hidden rounded-3xl shadow-xl border-4 border-white aspect-video lg:aspect-square">
            <img
              src="/craft-story.jpg"
              alt="Handcrafted wraps"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="story-copy space-y-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#ae002a]">Our Craft</p>
            <h2 className="text-3xl sm:text-4xl font-bold font-display text-[#1f1d1b]">
              <RotatingText
                texts={[
                  'Fresh wraps crafted with passion.',
                  'Real ingredients, zero shortcuts.',
                  'Your daily delicious fuel.',
                ]}
                splitBy="words"
                staggerFrom="last"
                staggerDuration={0.025}
                rotationInterval={2400}
              />
            </h2>
            <p className="text-sm sm:text-base text-[#6f6861] leading-relaxed">
              At Wrap &amp; Roll, we believe fast food should never mean compromising on quality. Every single wrap, roll, and salad is freshly prepared with locally sourced meats, crisp organic vegetables, and our house-made sauces.
            </p>
            <button
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#faeee2] text-[#ae002a] font-bold text-xs hover:bg-[#f6e0cd] transition-colors border border-[#ebdccb]"
              onClick={() => scrollTo('menu')}
            >
              Order Online Today <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>

      {/* Menu Section */}
      <section className="menu-section py-16 px-6 sm:px-12 max-w-7xl mx-auto border-t border-[#eee4d5]" id="menu">
        <div className="text-center max-w-xl mx-auto mb-10 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-[#ae002a]">Online Menu</p>
          <h2 ref={menuHeadingRef} className="menu-heading-animation text-3xl sm:text-4xl font-bold font-display text-[#1f1d1b]">Choose Your Favorite Dish</h2>
          <p className="text-xs sm:text-sm text-[#746e67]">
            Select an item to customize your order or pick bulk quantities for your group.
          </p>
        </div>

        {/* Category Pills Bar */}
        <div className="public-category-list flex gap-2 overflow-x-auto pb-3 mb-8 no-scrollbar justify-start sm:justify-center">
          {categories.map((cat, index) => {
            const categoryImage = cat.filter === 'all'
              ? publicMenu[0]?.image || brandFoodImages[0]
              : menuByCategory[cat.filter]?.items?.[0]?.image || brandFoodImages[index % brandFoodImages.length];

            return (
              <button
                key={cat.filter}
                type="button"
                onClick={() => setActiveCategory(cat.filter)}
                aria-pressed={activeCategory === cat.filter}
                className={'public-category-tile' + (activeCategory === cat.filter ? ' is-active' : '')}
              >
                <img
                  className="public-category-image"
                  src={categoryImage}
                  alt=""
                  aria-hidden="true"
                  onError={(event) => {
                    if (!event.currentTarget.dataset.fallbackApplied) {
                      event.currentTarget.dataset.fallbackApplied = 'true';
                      event.currentTarget.src = localCategoryImages[index % localCategoryImages.length];
                    } else {
                      event.currentTarget.style.visibility = 'hidden';
                    }
                  }}
                />
                <span className="public-category-label">{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Food Grid */}
        <div className="public-menu-grid food-grid grid grid-cols-1 sm:grid-cols-2 tablet:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {menuLoading && Array.from({ length: 8 }, (_, index) => (
            <div key={`menu-skeleton-${index}`} className="public-menu-card animate-pulse overflow-hidden rounded-3xl border border-[#ebdccb] bg-white">
              <div className="aspect-[4/3] bg-[#faeee2]" />
              <div className="space-y-3 p-5"><div className="h-4 w-2/3 rounded bg-[#f3ebde]" /><div className="h-3 w-full rounded bg-[#f3ebde]" /><div className="h-8 rounded-xl bg-[#f3ebde]" /></div>
            </div>
          ))}
          {!menuLoading && (menuByCategory[activeCategory]?.items || publicMenu).map((item) => (
            <article
              key={item.id}
              className="public-menu-card bg-white border border-[#ebdccb] rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between group cursor-pointer"
              style={{ animationDelay: `${Math.min(0.45, (item.id % 8) * 0.045)}s` }}
              onClick={() => openMealCustomizer(item)}
            >
              <div className="public-menu-media relative aspect-[4/5] overflow-hidden bg-[#faeee2]">
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                  onError={(e) => {
                    if (!e.currentTarget.dataset.fallbackApplied) {
                      e.currentTarget.dataset.fallbackApplied = 'true';
                      e.currentTarget.src = '/delivery-wraps.jpg';
                    } else {
                      e.currentTarget.style.visibility = 'hidden';
                    }
                  }}
                />
                <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full bg-white/90 backdrop-blur-sm text-[10px] font-bold text-[#ae002a] uppercase tracking-wider shadow-sm">
                  {item.category}
                </span>
              </div>

              <div className="public-menu-details p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <h3 className="font-display font-bold text-base text-[#1f1d1b] group-hover:text-[#ae002a] transition-colors">
                    {item.name}
                  </h3>
                  <p className="text-xs text-[#746e67] line-clamp-2 mt-1 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#f3ebde]">
                  <strong className="text-sm sm:text-base font-bold text-[#ae002a]">
                    {item.variants?.length ? 'From ' : ''}{formatCurrency(item.variants?.length ? Math.min(...item.variants.map((variant) => Number(variant.price))) : item.price, displayCurrency)}
                  </strong>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openMealCustomizer(item);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#faeee2] text-[#ae002a] text-xs font-bold hover:bg-[#f6e0cd] transition-colors"
                    >
                      Options
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        quickAddToCart(item);
                      }}
                      className="w-8 h-8 rounded-xl bg-[#ae002a] text-white flex items-center justify-center font-bold text-base hover:bg-[#920023] transition-colors shadow-sm"
                      aria-label={`Quick add ${item.name}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Item Customization Modal for Public Customers */}
      {selectedMealItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#fffdfa] border border-[#ebdccb] rounded-3xl shadow-2xl max-w-md w-full p-6 animate-slide-up space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={selectedMealItem.image}
                  alt=""
                  className="w-14 h-14 rounded-2xl object-cover border border-[#ebdccb]"
                />
                <div>
                  <h3 className="font-display font-bold text-base text-[#1f1d1b]">{selectedMealItem.name}</h3>
                  <p className="text-xs font-bold text-[#ae002a]">
                    {formatCurrency((selectedMealVariant?.price ?? selectedMealItem.price) + mealModifiers.reduce((sum, modifier) => sum + Number(modifier.price || 0), 0), displayCurrency)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedMealItem(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-[#fbf6ee] text-[#746e67]"
              >
                <X size={18} />
              </button>
            </div>

            {selectedMealItem.variants?.length > 0 && (
              <section aria-label="Choose a size" className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#746e67]">Choose a size</h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {selectedMealItem.variants.map((variant) => {
                    const selected = selectedMealVariant?.name === variant.name;
                    return (
                      <button
                        key={variant.name}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSelectedMealVariant(variant)}
                        className={'flex min-h-12 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left ' + (selected ? 'border-[#ae002a] bg-[#fff3ec] text-[#ae002a]' : 'border-[#ebdccb] bg-white text-[#554e46]')}
                      >
                        <span className="text-xs font-bold">{variant.name}</span>
                        <span className="text-xs font-semibold">{formatCurrency(variant.price, displayCurrency)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Quantity Selector for Bulk / Family Orders */}
            <div className="p-3.5 bg-[#fbf6ee] border border-[#ebdccb] rounded-2xl space-y-2">
              <label className="text-xs font-bold text-[#746e67] uppercase tracking-wider block">
                Order Quantity
              </label>
              <div className="flex items-center gap-2">
                <div className="flex items-center border border-[#d9cdb7] bg-white rounded-xl shadow-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setMealQuantity((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 flex items-center justify-center text-[#746e67] hover:bg-[#faeee2]"
                  >
                    <Minus size={15} />
                  </button>
                  <span className="w-12 text-center font-bold text-sm text-[#24211e]">{mealQuantity}</span>
                  <button
                    type="button"
                    onClick={() => setMealQuantity((q) => q + 1)}
                    className="w-9 h-9 flex items-center justify-center text-[#746e67] hover:bg-[#faeee2]"
                  >
                    <Plus size={15} />
                  </button>
                </div>

                <div className="flex gap-1">
                  {[1, 2, 5, 10].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setMealQuantity(preset)}
                      className={
                        'px-2.5 py-1.5 rounded-xl text-xs font-bold ' +
                        (mealQuantity === preset
                          ? 'bg-[#ae002a] text-white'
                          : 'bg-white border border-[#e4d6c4] text-[#554e46]')
                      }
                    >
                      {preset}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[#746e67] uppercase tracking-wider block mb-1">
                Special Instructions (Sauces, allergies, packaging)
              </label>
              <textarea
                value={mealInstructions}
                onChange={(e) => setMealInstructions(e.target.value)}
                placeholder="E.g., extra spicy, no onion, separate dressing..."
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-[#ebdccb] bg-white text-xs text-[#24211e] focus:outline-none focus:border-[#ae002a] resize-none"
              />
            </div>

            {(() => {
              // Scope extras to those mapped to this item; fall back to all 'add' modifiers
              // only when the item has no specific mapping.
              const itemAddModifiers = (selectedMealItem.modifiers || []).filter((modifier) => modifier.type === 'add');
              const extras = itemAddModifiers.length
                ? itemAddModifiers
                : publicModifiers.filter((modifier) => modifier.type === 'add');
              if (!extras.length) return null;
              return (
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#746e67] uppercase tracking-wider block">Add extras</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {extras.map((modifier) => {
                    const selected = mealModifiers.some((entry) => entry.id === modifier.id);
                    return <button key={modifier.id} type="button" onClick={() => setMealModifiers((current) => selected ? current.filter((entry) => entry.id !== modifier.id) : [...current, modifier])} className={'flex items-center justify-between rounded-xl border px-3 py-2 text-left text-xs font-semibold ' + (selected ? 'border-[#ae002a] bg-[#fff3ec] text-[#ae002a]' : 'border-[#ebdccb] bg-white text-[#554e46]')}><span>{modifier.name}</span><span>{modifier.price > 0 ? `+ ${formatCurrency(modifier.price, displayCurrency)}` : 'Included'}</span></button>;
                  })}
                </div>
              </div>
              );
            })()}

            <div className="pt-2 flex items-center justify-between">
              <span className="font-bold text-sm text-[#ae002a]">
                Total: {formatCurrency(((selectedMealVariant?.price ?? selectedMealItem.price) + mealModifiers.reduce((sum, modifier) => sum + Number(modifier.price || 0), 0)) * mealQuantity, displayCurrency)}
              </span>
              <button
                onClick={addCustomizedMealToCart}
                disabled={Boolean(selectedMealItem.variants?.length && !selectedMealVariant)}
                className="px-5 py-2.5 rounded-xl bg-[#ae002a] text-white font-bold text-xs shadow-md hover:bg-[#920023]"
              >
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location / Visit Section */}
      <section className="visit-section py-16 px-6 sm:px-12 max-w-7xl mx-auto border-t border-[#eee4d5]" id="visit">
        <div className="visit-content">
          <div className="map-copy space-y-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#ae002a]">Dine In &amp; Takeaway</p>
            <h2 className="text-3xl sm:text-4xl font-bold font-display text-[#1f1d1b]">Visit Our Restaurant</h2>
            <p className="text-sm text-[#6f6861] leading-relaxed">
              {restaurantLocation.label}, Dar es Salaam, Tanzania. Open daily for breakfast, lunch, dinner, and late cravings.
            </p>
            <div className="space-y-2 text-xs font-semibold text-[#554e46]">
              <p className="flex items-center gap-2"><Clock size={16} className="text-[#ae002a]" /> Daily: 7:00 AM &ndash; 11:00 PM</p>
              <p className="flex items-center gap-2"><Phone size={16} className="text-[#ae002a]" /> +255 746 222 889</p>
              <p className="flex items-center gap-2"><Mail size={16} className="text-[#ae002a]" /> info@wrapandrolltz.com</p>
            </div>
            <a
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ae002a] text-white font-bold text-xs shadow-md hover:bg-[#920023] transition-colors"
              href={restaurantLocation.mapsUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open in Google Maps <ArrowRight size={15} />
            </a>
          </div>

          <div className="map-shell rounded-3xl overflow-hidden shadow-xl border-4 border-white aspect-video">
            <iframe
              title="Wrap & Roll location"
              className="w-full h-full border-0"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3962.0852270366922!2d39.251722599999994!3d-6.7594617!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x185c4d08cb7bb7f1%3A0x2fca94e306e228d4!2sWrap%20%26%20Roll!5e0!3m2!1sen!2stz!4v1787495167004!5m2!1sen!2stz"
              allowFullScreen
              loading="lazy"
            />
          </div>
        </div>
      </section>

      <CustomerChat t={t} />

      {/* Cart Drawer Modal */}
      {cartOpen && (
        <div className="public-cart-backdrop fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setCartOpen(false)}>
          <section className="public-cart bg-[#fffdfa] border-l border-[#ebdccb] w-full max-w-md h-full overflow-y-auto p-6 shadow-2xl flex flex-col justify-between animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#eee4d5]">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={20} className="text-[#ae002a]" />
                  <h2 className="font-display font-bold text-lg text-[#1f1d1b]">Your Order Cart</h2>
                </div>
                <button onClick={() => setCartOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center bg-[#fbf6ee] text-[#746e67]">
                  <X size={18} />
                </button>
              </div>

              {/* Cart Item List */}
              <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                {cartItems.length ? (
                  cartItems.map((item) => (
                    <div key={item.cartId || item.id} className="p-3 bg-white border border-[#ebdccb] rounded-2xl shadow-sm flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-xs text-[#1f1d1b] truncate">{item.name}</p>
                        {item.instructions && <p className="text-[10px] text-[#746e67] italic truncate">{item.instructions}</p>}
                        <p className="text-xs font-bold text-[#ae002a] mt-0.5">{formatCurrency(item.price * item.qty, displayCurrency)}</p>
                      </div>

                      <div className="flex items-center gap-1.5 border border-[#d9cdb7] rounded-xl px-2 py-1 bg-[#fbf6ee]">
                        <button onClick={() => changeQuantity(item.cartId || item.id, item.qty - 1)} className="text-xs font-bold text-[#746e67] hover:text-[#ae002a]">-</button>
                        <span className="text-xs font-bold min-w-4 text-center">{item.qty}</span>
                        <button onClick={() => changeQuantity(item.cartId || item.id, item.qty + 1)} className="text-xs font-bold text-[#746e67] hover:text-[#ae002a]">+</button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-xs text-[#746e67]">Your cart is currently empty.</div>
                )}
              </div>

              {/* Checkout Form */}
              {cartItems.length > 0 && (
                <form onSubmit={submitOrder} className="space-y-2.5 pt-2 border-t border-[#eee4d5]">
                  <input required value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your Full Name" className="w-full px-3.5 py-2.5 rounded-xl border border-[#ebdccb] bg-white text-xs focus:outline-none focus:border-[#ae002a]" />
                  <input required type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone Number (e.g., 0712345678)" className="w-full px-3.5 py-2.5 rounded-xl border border-[#ebdccb] bg-white text-xs focus:outline-none focus:border-[#ae002a]" />
                  <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Email for order receipt and invoice (Optional)" className="w-full px-3.5 py-2.5 rounded-xl border border-[#ebdccb] bg-white text-xs focus:outline-none focus:border-[#ae002a]" />
                  <label className="block text-[11px] font-semibold text-[#746e67]">Invoice type<select value={customerType} onChange={(event) => setCustomerType(event.target.value)} className="mt-1 w-full rounded-xl border border-[#ebdccb] bg-white px-3.5 py-2.5 text-xs focus:outline-none focus:border-[#ae002a]"><option value="individual">Individual</option><option value="company">Company</option></select></label>
                  {customerType === 'company' && <input required value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Company name" className="w-full px-3.5 py-2.5 rounded-xl border border-[#ebdccb] bg-white text-xs focus:outline-none focus:border-[#ae002a]" />}
                  <input required={customerType === 'company'} value={customerTin} onChange={(event) => setCustomerTin(event.target.value)} placeholder={customerType === 'company' ? 'Company TIN (Required)' : 'Customer TIN (Optional)'} className="w-full px-3.5 py-2.5 rounded-xl border border-[#ebdccb] bg-white text-xs focus:outline-none focus:border-[#ae002a]" />
                  {customerType === 'company' && <input value={billingAddress} onChange={(event) => setBillingAddress(event.target.value)} placeholder="Billing address (Optional)" className="w-full px-3.5 py-2.5 rounded-xl border border-[#ebdccb] bg-white text-xs focus:outline-none focus:border-[#ae002a]" />}
                  {customerType === 'company' && <label className="flex items-start gap-2 rounded-xl border border-[#ebdccb] bg-[#fbf6ee] p-3 text-[11px] leading-4 text-[#746e67]"><input type="checkbox" checked={companyInvoiceTerms} onChange={(event) => setCompanyInvoiceTerms(event.target.checked)} className="mt-0.5" /><span><strong className="text-[#24211e]">Use approved company invoice terms</strong><br />Available only to registered company accounts within their approved credit limit. Otherwise, pay now.</span></label>}
                  <label className="flex items-start gap-2 px-1 text-[11px] leading-4 text-[#746e67]"><input type="checkbox" checked={emailMarketingConsent} onChange={(event) => setEmailMarketingConsent(event.target.checked)} disabled={!customerEmail.trim()} className="mt-0.5" /><span>Email me restaurant news and offers. I’ll confirm my subscription from my inbox.</span></label>
                  {!customerEmail.trim() && <p className="px-1 text-[10px] italic text-[#a09a92]">Enter your email above to enable news &amp; offers signup.</p>}

                  {!tableContext && <label className="block text-[11px] font-semibold text-[#746e67]">Fulfillment<select value={fulfillmentMode} onChange={(event) => setFulfillmentMode(event.target.value)} className="mt-1 w-full rounded-xl border border-[#ebdccb] bg-white px-3.5 py-2.5 text-xs"><option value="standard">Delivery to an address</option><option value="roadside_handoff">Roadside handoff · Mwai Kibaki Road</option></select></label>}
                  <label className="block text-[11px] font-semibold text-[#746e67]">Pickup / handoff time (optional)<input type="datetime-local" value={scheduledFor} min={new Date(Date.now() + 5 * 60 * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={(event) => setScheduledFor(event.target.value)} className="mt-1 w-full rounded-xl border border-[#ebdccb] bg-white px-3.5 py-2.5 text-xs" /></label>
                  {fulfillmentMode !== 'roadside_handoff' && <div className="flex gap-2">
                    <input required={!tableContext} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Delivery Address or Table Number" className="flex-1 rounded-xl border border-[#ebdccb] bg-white px-3.5 py-2.5 text-xs focus:outline-none focus:border-[#ae002a]" />
                    <button type="button" onClick={useCustomerLocation} disabled={locating} className="flex items-center gap-1 rounded-xl border border-[#ebdccb] bg-[#faeee2] px-3 py-2 text-xs font-bold text-[#ae002a]">
                      <MapPin size={13} /> {locating ? '...' : 'GPS'}
                    </button>
                  </div>}

                  <div className="pt-2 flex justify-between text-xs font-bold text-[#1f1d1b]">
                    <span>Total (Inc. Tax)</span>
                    <span className="text-[#ae002a] text-sm">{formatCurrency(cartSubtotal + cartTax, displayCurrency)}</span>
                  </div>

                  <button type="submit" disabled={!cartItems.length} className="w-full py-3 rounded-2xl bg-[#ae002a] text-white font-bold text-xs sm:text-sm shadow-md hover:bg-[#920023] transition-colors">
                    {companyInvoiceTerms && customerType === 'company' ? 'Place Company Order' : 'Continue to Payment'} &rarr;
                  </button>
                  {orderStatus && <p className="text-xs font-bold text-[#ae002a] text-center pt-1">{orderStatus}</p>}
                </form>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Lipa Namba Payment Tracking Modal */}
      {paymentModalOpen && activePlacedOrder && (
        <LipaPaymentModal
          isOpen={paymentModalOpen}
          order={activePlacedOrder}
          onClose={() => {
            setPaymentModalOpen(false);
          }}
          onSuccess={(paidOrder) => {
            setActivePlacedOrder(paidOrder);
          }}
        />
      )}

      {activePlacedOrder && !paymentModalOpen && (
        <button
          type="button"
          onClick={() => setPaymentModalOpen(true)}
          className="fixed bottom-6 left-6 z-40 rounded-full border border-[#ebdccb] bg-[#fffdfa] px-4 py-3 text-left text-xs font-bold text-[#ae002a] shadow-xl transition hover:-translate-y-0.5"
        >
          <span className="block text-[10px] uppercase tracking-wider text-[#746e67]">Order {activePlacedOrder.orderNumber || activePlacedOrder.id}</span>
          <span>{activePlacedOrder.paymentTerms === 'invoice' ? 'Company invoice confirmed' : activePlacedOrder.paymentStatus === 'paid' ? 'Payment confirmed' : 'Payment status: checking'}</span>
        </button>
      )}

      {activePlacedOrder?.fulfillmentMode === 'roadside_handoff' && (activePlacedOrder.paymentStatus === 'paid' || (activePlacedOrder.paymentTerms === 'invoice' && activePlacedOrder.reservationStatus === 'confirmed')) && roadsideAccessToken && (
        <RoadsideTrackingPanel order={activePlacedOrder} accessToken={roadsideAccessToken} />
      )}

      {/* Floating Cart Button */}
      {cartCount > 0 && !cartOpen && (
        <button
          className="fixed bottom-6 right-6 z-40 px-4 py-3 rounded-full bg-[#ae002a] text-white font-bold shadow-2xl flex items-center gap-2.5 hover:scale-105 transition-transform"
          onClick={() => setCartOpen(true)}
        >
          <ShoppingBag size={18} />
          <span>{cartCount} items</span>
          <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
            {formatCurrency(cartSubtotal + cartTax, displayCurrency)}
          </span>
        </button>
      )}

      {/* Footer */}
      <footer className="public-footer bg-[#1f1d1b] text-white py-12 px-6 sm:px-12 border-t border-white/10 mt-16" id="contact">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 tablet:grid-cols-3 lg:grid-cols-4 gap-8">
          <div className="space-y-3">
            <BrandLogo variant="dark" />
            <p className="text-xs text-white/70 leading-relaxed">
              Wrap &amp; Roll Tanzania. Dedicated to crafting healthy, mouth-watering wraps, rolls, and meals with pure fresh ingredients.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-3 text-[#ffc72c]">Quick Links</h4>
            <div className="space-y-2 text-xs text-white/70 flex flex-col items-start">
              <button onClick={() => scrollTo('home')}>Home</button>
              <button onClick={() => scrollTo('menu')}>Menu Catalog</button>
              <button onClick={() => scrollTo('visit')}>Outlets &amp; Reservation</button>
              <a href="/login">Staff Dashboard</a>
            </div>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-3 text-[#ffc72c]">Location</h4>
            <p className="text-xs text-white/70 leading-relaxed">
              Wikicha Tower, Mwai Kibaki Rd, Mikocheni, Dar es Salaam.<br />
              Open daily: 7:00 AM &ndash; 11:00 PM
            </p>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-3 text-[#ffc72c]">Contact Us</h4>
            <p className="text-xs text-white/70">Phone: +255 746 222 889</p>
            <p className="text-xs text-white/70 mt-1">Email: info@wrapandrolltz.com</p>
          </div>
        </div>
        <div className="max-w-7xl mx-auto pt-8 mt-8 border-t border-white/10 text-center text-xs text-white/50">
          &copy; 2026 Wrap &amp; Roll Tanzania. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
