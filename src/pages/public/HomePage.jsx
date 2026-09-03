import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
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
} from 'lucide-react';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/format';
import BrandLogo from '../../components/brand/BrandLogo';
import useSettingsStore from '../../store/useSettingsStore';
import useTranslation from '../../i18n/useTranslation';
import CustomerChat from '../../components/public/CustomerChat';
import LipaNambaPayment from '../../components/public/LipaNambaPayment';
import RotatingText from '../../components/ui/RotatingText';
import DepthText from '../../components/ui/DepthText';

const categories = [
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

const restaurantLocation = {
  label: 'Wikicha Tower, Mwai Kibaki Road',
  mapsUrl: 'https://maps.app.goo.gl/gZqwfknocNK6FYNAA',
};

export default function HomePage() {
  const { tagId } = useParams();
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
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState(
    () => localStorage.getItem('wraproll_customer_phone') || ''
  );
  const [customerEmail, setCustomerEmail] = useState(
    () => localStorage.getItem('wraproll_customer_email') || ''
  );
  const [paymentReference, setPaymentReference] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [locating, setLocating] = useState(false);
  const [orderStatus, setOrderStatus] = useState('');
  const [publicMenu, setPublicMenu] = useState([]);
  const [tableContext, setTableContext] = useState(null);
  const [selectedMealItem, setSelectedMealItem] = useState(null);
  const [mealQuantity, setMealQuantity] = useState(1);
  const [mealInstructions, setMealInstructions] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const lipaNambaNumber = useSettingsStore((state) => state.settings.lipa_namba_number || '123456');
  const lipaNambaAccountsValue = useSettingsStore((state) => state.settings.lipa_namba_accounts || '');
  const lipaNambaAccounts = (() => {
    try {
      const accounts = JSON.parse(lipaNambaAccountsValue || '[]');
      return Array.isArray(accounts) ? accounts.filter((account) => account.number) : [];
    } catch {
      return [];
    }
  })();

  const cartCount = cartItems.reduce((sum, item) => sum + item.qty, 0);
  const cartSubtotal = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const cartTax = cartSubtotal * 0.08;

  // Group menu items by category
  const menuByCategory = categories.reduce((acc, cat) => {
    const items = publicMenu.filter((item) => cat.filter === 'all' || item.category === cat.filter);
    if (items.length > 0) acc[cat.filter] = { ...cat, items };
    return acc;
  }, {});

  useEffect(() => {
    api.getPublicMenu().then(setPublicMenu).catch(() => {});
  }, []);

  useEffect(() => {
    api
      .getPublicSettings()
      .then((settings) =>
        useSettingsStore.setState((state) => ({ settings: { ...state.settings, ...settings } }))
      )
      .catch(() => {});
  }, []);

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
    setMealQuantity(1);
    setMealInstructions('');
  };

  const addCustomizedMealToCart = () => {
    if (!selectedMealItem) return;
    setCartItems((items) => {
      const existing = items.find((cartItem) => cartItem.id === selectedMealItem.id);
      if (existing) {
        return items.map((cartItem) =>
          cartItem.id === selectedMealItem.id
            ? { ...cartItem, qty: cartItem.qty + mealQuantity, instructions: mealInstructions }
            : cartItem
        );
      }
      return [
        ...items,
        {
          id: selectedMealItem.id,
          name: selectedMealItem.name,
          description: selectedMealItem.description,
          image: selectedMealItem.image,
          price: selectedMealItem.price,
          qty: mealQuantity,
          instructions: mealInstructions,
        },
      ];
    });
    setSelectedMealItem(null);
    setCartOpen(true);
  };

  const quickAddToCart = (item) => {
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
          name: item.name,
          description: item.description,
          image: item.image,
          price: item.price,
          qty: 1,
        },
      ];
    });
  };

  const changeQuantity = (itemId, quantity) => {
    setCartItems((items) =>
      items
        .map((item) => (item.id === itemId ? { ...item, qty: quantity } : item))
        .filter((item) => item.qty > 0)
    );
  };

  const submitOrder = async (event) => {
    event.preventDefault();
    if (!cartItems.length) return setOrderStatus('Add a dish before checking out.');
    if (!paymentReference.trim()) return setOrderStatus('Enter the Lipa Namba payment reference.');
    setOrderStatus('Sending your order...');
    try {
      const order = await api.createPublicOrder({
        items: cartItems.map((item) => ({
          menuItemId: item.id,
          qty: item.qty,
          specialInstructions: item.instructions || undefined,
        })),
        customerName,
        customerPhone,
        customerEmail,
        deliveryAddress: tableContext ? '' : deliveryAddress,
        orderType: tableContext ? 'dine-in' : 'delivery',
        tableNumber: tableContext?.number || null,
        orderSource: tableContext ? 'nfc' : 'website',
        paymentReference,
      });
      setOrderStatus(`Order ${order.id} received successfully! The kitchen is preparing your meal.`);
      setCartItems([]);
      setDeliveryAddress('');
      setPaymentReference('');
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
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}`
          );
          const result = await response.json();
          setDeliveryAddress(result.display_name || coordinateAddress);
        } catch {
          setDeliveryAddress(coordinateAddress);
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

        <nav className={mobileMenuOpen ? 'public-nav is-open' : 'public-nav'}>
          <button onClick={() => scrollTo('home')}>{t('home')}</button>
          <button onClick={() => scrollTo('story')}>{t('about')}</button>
          <button onClick={() => scrollTo('menu')}>{t('orderOnline')}</button>
          <button onClick={() => scrollTo('visit')}>{t('reservation')}</button>
          <button onClick={() => scrollTo('contact')}>{t('contact')}</button>

          <button
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

      {/* Hero Section with Full Background Image */}
      <section className="relative min-h-[580px] sm:min-h-[640px] flex items-center overflow-hidden" id="home">
        {/* Background Image with Gentle Soft Contrast Overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src="/hero-food.jpg"
            alt="Wrap & Roll Banner"
            className="w-full h-full object-cover object-center brightness-[0.92]"
          />
          {/* Subtle soft dark tint so the food details, colors, and textures remain fully visible */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/35 to-black/15" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-12 py-20 sm:py-28 w-full">
          <div className="max-w-2xl space-y-6">
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold font-display text-white leading-[1.06] tracking-tight drop-shadow-[0_4px_14px_rgba(0,0,0,0.85)]">
              Craving Authentic <span className="text-[#ffc72c]">Wraps &amp; Rolls?</span>
            </h1>
            <p className="text-base sm:text-lg text-white leading-relaxed max-w-xl font-medium drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]">
              Freshly grilled proteins, crisp garden greens, and homemade signature sauces rolled to perfection in Dar es Salaam.
            </p>
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="story-section py-16 px-6 sm:px-12 max-w-7xl mx-auto border-t border-[#eee4d5]" id="story">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
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
      <section className="py-16 px-6 sm:px-12 max-w-7xl mx-auto border-t border-[#eee4d5]" id="menu">
        <div className="text-center max-w-xl mx-auto mb-10 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-[#ae002a]">Online Menu</p>
          <h2 className="text-3xl sm:text-4xl font-bold font-display text-[#1f1d1b]">Choose Your Favorite Dish</h2>
          <p className="text-xs sm:text-sm text-[#746e67]">
            Select an item to customize your order or pick bulk quantities for your group.
          </p>
        </div>

        {/* Category Pills Bar */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-8 no-scrollbar justify-start sm:justify-center">
          {categories.map((cat) => (
            <button
              key={cat.filter}
              onClick={() => setActiveCategory(cat.filter)}
              className={
                'px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ' +
                (activeCategory === cat.filter
                  ? 'bg-[#ae002a] text-white shadow-md'
                  : 'bg-white border border-[#ebdccb] text-[#554e46] hover:bg-[#faeee2]')
              }
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Food Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {(menuByCategory[activeCategory]?.items || publicMenu).map((item) => (
            <article
              key={item.id}
              className="bg-white border border-[#ebdccb] rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between group cursor-pointer"
              onClick={() => openMealCustomizer(item)}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-[#faeee2]">
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  onError={(e) => {
                    e.currentTarget.src =
                      'https://wrapandrolltz.com/uploads/photo_gallery/d706fc0ef56440dd131465fd75aae870.jpg';
                  }}
                />
                <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full bg-white/90 backdrop-blur-sm text-[10px] font-bold text-[#ae002a] uppercase tracking-wider shadow-sm">
                  {item.category}
                </span>
              </div>

              <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3">
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
                    {formatCurrency(item.price, displayCurrency)}
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
                    {formatCurrency(selectedMealItem.price, displayCurrency)}
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

            <div className="pt-2 flex items-center justify-between">
              <span className="font-bold text-sm text-[#ae002a]">
                Total: {formatCurrency(selectedMealItem.price * mealQuantity, displayCurrency)}
              </span>
              <button
                onClick={addCustomizedMealToCart}
                className="px-5 py-2.5 rounded-xl bg-[#ae002a] text-white font-bold text-xs shadow-md hover:bg-[#920023]"
              >
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location / Visit Section */}
      <section className="w-full py-16 px-6 sm:px-12 max-w-7xl mx-auto border-t border-[#eee4d5]" id="visit">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
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
                    <div key={item.id} className="p-3 bg-white border border-[#ebdccb] rounded-2xl shadow-sm flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-xs text-[#1f1d1b] truncate">{item.name}</p>
                        {item.instructions && <p className="text-[10px] text-[#746e67] italic truncate">{item.instructions}</p>}
                        <p className="text-xs font-bold text-[#ae002a] mt-0.5">{formatCurrency(item.price * item.qty, displayCurrency)}</p>
                      </div>

                      <div className="flex items-center gap-1.5 border border-[#d9cdb7] rounded-xl px-2 py-1 bg-[#fbf6ee]">
                        <button onClick={() => changeQuantity(item.id, item.qty - 1)} className="text-xs font-bold text-[#746e67] hover:text-[#ae002a]">-</button>
                        <span className="text-xs font-bold min-w-4 text-center">{item.qty}</span>
                        <button onClick={() => changeQuantity(item.id, item.qty + 1)} className="text-xs font-bold text-[#746e67] hover:text-[#ae002a]">+</button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-xs text-[#746e67]">Your cart is currently empty.</div>
                )}
              </div>

              {/* Payment Component */}
              {cartItems.length > 0 && (
                <LipaNambaPayment
                  number={lipaNambaNumber}
                  accounts={lipaNambaAccounts}
                  reference={paymentReference}
                  onReferenceChange={setPaymentReference}
                />
              )}

              {/* Checkout Form */}
              {cartItems.length > 0 && (
                <form onSubmit={submitOrder} className="space-y-2.5 pt-2 border-t border-[#eee4d5]">
                  <input required value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your Full Name" className="w-full px-3.5 py-2.5 rounded-xl border border-[#ebdccb] bg-white text-xs focus:outline-none focus:border-[#ae002a]" />
                  <input required type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone Number (e.g., 0712345678)" className="w-full px-3.5 py-2.5 rounded-xl border border-[#ebdccb] bg-white text-xs focus:outline-none focus:border-[#ae002a]" />
                  <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Email Address (Optional)" className="w-full px-3.5 py-2.5 rounded-xl border border-[#ebdccb] bg-white text-xs focus:outline-none focus:border-[#ae002a]" />

                  <div className="flex gap-2">
                    <input required value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Delivery Address or Table Number" className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#ebdccb] bg-white text-xs focus:outline-none focus:border-[#ae002a]" />
                    <button type="button" onClick={useCustomerLocation} disabled={locating} className="px-3 py-2 rounded-xl bg-[#faeee2] text-[#ae002a] text-xs font-bold flex items-center gap-1 border border-[#ebdccb]">
                      <MapPin size={13} /> {locating ? '...' : 'GPS'}
                    </button>
                  </div>

                  <div className="pt-2 flex justify-between text-xs font-bold text-[#1f1d1b]">
                    <span>Total (Inc. Tax)</span>
                    <span className="text-[#ae002a] text-sm">{formatCurrency(cartSubtotal + cartTax, displayCurrency)}</span>
                  </div>

                  <button type="submit" disabled={!cartItems.length} className="w-full py-3 rounded-2xl bg-[#ae002a] text-white font-bold text-xs sm:text-sm shadow-md hover:bg-[#920023] transition-colors">
                    Place Order Now &rarr;
                  </button>
                  {orderStatus && <p className="text-xs font-bold text-[#ae002a] text-center pt-1">{orderStatus}</p>}
                </form>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Floating Cart Button */}
      {cartCount > 0 && (
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
      <footer className="w-full bg-[#1f1d1b] text-white py-14 px-6 sm:px-12 border-t border-white/10 mt-16" id="contact">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
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
