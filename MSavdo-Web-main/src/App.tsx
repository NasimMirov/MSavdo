/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Product, Category, CartItem } from './types';
import { ProductCard } from './components/ProductCard';
import { ToastContainer, ToastItem } from './components/Toast';
import { apiFetch } from './api';
import { useI18n } from './i18n';
import { addCartItem, mergeCartItems, MAX_CART_QUANTITY } from './utils/cart';
import { 
  Search, 
  ShoppingBasket,
  Package, 
  Lock,
  X,
  MessageCircle,
  Home,
  CheckCircle2,
  ChevronDown,
  SlidersHorizontal,
  Settings,
  Instagram,
  Send,
  Youtube,
} from 'lucide-react';

const BRAND_LOGO_URL = '/msavdo-logo.webp';
const AdminPanel = lazy(() => import('./components/AdminPanel').then((module) => ({ default: module.AdminPanel })));
const ProductDetailModal = lazy(() => import('./components/ProductDetailModal').then((module) => ({ default: module.ProductDetailModal })));
const CartDrawer = lazy(() => import('./components/CartDrawer').then((module) => ({ default: module.CartDrawer })));
const RulesView = lazy(() => import('./components/RulesView').then((module) => ({ default: module.RulesView })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then((module) => ({ default: module.SettingsModal })));

function getCategoryIllustration(name: string): string {
  const category = name.toLocaleLowerCase('ru');
  if (/женская одежда/.test(category)) return '👗';
  if (/мужская одежда/.test(category)) return '👔';
  if (/нижнее белье/.test(category)) return '🩱';
  if (/^обувь$/.test(category)) return '👟';
  if (/сумки, рюкзаки/.test(category)) return '👜';
  if (/аксессуары, часы/.test(category)) return '⌚';
  if (/электроника и гаджеты/.test(category)) return '📱';
  if (/электронные компоненты/.test(category)) return '🔌';
  if (/бытовая техника/.test(category)) return '🔌';
  if (/товары для дома/.test(category)) return '🏠';
  if (/мебель, ремонт/.test(category)) return '🛋️';
  if (/красота, уход/.test(category)) return '🪞';
  if (/детские товары/.test(category)) return '🧸';
  if (/спорт, туризм/.test(category)) return '⛺';
  if (/транспорт:/.test(category)) return '🚲';
  if (/канцелярия, хобби/.test(category)) return '🎨';
  return '🎁';
}

export default function App() {
  const { t } = useI18n();
  const [currentView, setCurrentView] = useState<'catalog' | 'rules' | 'admin'>('catalog');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  // Глобальная система всплывающих уведомлений (Toasts)
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Данные каталога из API
  const [products, setProducts] = useState<Product[]>([]);
  const [publicOffers, setPublicOffers] = useState<Array<{ id: number; title: string }>>([]);
  const [recommendedProducts, setRecommendedProducts] = useState<Product[]>([]);
  const [totalProductCount, setTotalProductCount] = useState(0);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [categoriesTree, setCategoriesTree] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<'initial' | 'more' | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState('992444431');
  const [showWhatsAppHelp, setShowWhatsAppHelp] = useState(false);
  const [dismissedWhatsAppHelp, setDismissedWhatsAppHelp] = useState(() => {
    try {
      return Boolean(sessionStorage.getItem('msavdo_whatsapp_help'));
    } catch (error) {
      console.warn('[WhatsApp Help] Не удалось прочитать состояние подсказки:', error);
      return false;
    }
  });
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchHints, setSearchHints] = useState<{
    suggestions: string[];
    popular: Array<{ query_text: string; searches_count: number }>;
  }>({ suggestions: [], popular: [] });
  const [removedCartItem, setRemovedCartItem] = useState<CartItem | null>(null);

  // Фильтры, живой поиск и сортировка (Требование 7)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | 'stock' | 'order'>('all');
  const [sortBy, setSortBy] = useState<'popular' | 'price_asc' | 'price_desc' | 'newest'>('popular');
  const [expandedCategoryId, setExpandedCategoryId] = useState<number | null>(null);
  const [isCategoryBrowserOpen, setIsCategoryBrowserOpen] = useState(false);
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [deliveryCounts, setDeliveryCounts] = useState<{ all: number; order: number; stock: number } | null>(null);
  const [browsingCategoryId, setBrowsingCategoryId] = useState<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastTrackedSearch = useRef('');
  const viewedProductIds = useRef<Set<number>>(new Set());
  const catalogRequestId = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      apiFetch('/api/promotions', { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (active) setPublicOffers(data.promotions);
      }).catch((error) => { if (!controller.signal.aborted) console.error('[Offers]', error); });
    }, 18000);
    const loadOffersAfterImage = () => {
      window.clearTimeout(timer);
      apiFetch('/api/promotions', { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (active) setPublicOffers(data.promotions);
      }).catch((error) => { if (!controller.signal.aborted) console.error('[Offers]', error); });
    };
    window.addEventListener('msavdo:primary-image-ready', loadOffersAfterImage, { once: true });
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener('msavdo:primary-image-ready', loadOffersAfterImage);
      controller.abort();
    };
  }, []);
  const isProductModalOpen = selectedProduct !== null;
  const activeBrowseTime = useRef(0);
  const canShowWhatsAppHelp = useRef(false);
  canShowWhatsAppHelp.current = currentView === 'catalog' && !isCartOpen && !isProductModalOpen;

  useEffect(() => {
    if (dismissedWhatsAppHelp) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || !canShowWhatsAppHelp.current) return;
      activeBrowseTime.current += 1000;
      if (activeBrowseTime.current < 60000) return;

      setShowWhatsAppHelp(true);
      window.clearInterval(timer);
      try {
        sessionStorage.setItem('msavdo_whatsapp_help', 'shown');
      } catch (error) {
        console.warn('[WhatsApp Help] Не удалось сохранить показ подсказки:', error);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [dismissedWhatsAppHelp]);

  const closeWhatsAppHelp = () => {
    setShowWhatsAppHelp(false);
    setDismissedWhatsAppHelp(true);
    try {
      sessionStorage.setItem('msavdo_whatsapp_help', 'dismissed');
    } catch (error) {
      console.warn('[WhatsApp Help] Не удалось сохранить закрытие подсказки:', error);
    }
  };

  const whatsappHelpUrl = `https://wa.me/${whatsappPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
    'Ассаламу Алайкум!'
  )}`;

  // Открытие карточки товара с автоматическим счетчиком просмотров
  const handleOpenProduct = (p: Product) => {
    setSelectedProduct(p);
    if (!viewedProductIds.current.has(p.id)) {
      viewedProductIds.current.add(p.id);
      apiFetch(`/api/products/${p.id}/view`, { method: 'POST' }).catch((error) => {
        console.error('[Product View Count Error]', error);
      });
    }
  };

  useEffect(() => {
    if (!isProductModalOpen) return;

    const currentState = window.history.state;
    window.history.pushState(
      { ...(typeof currentState === 'object' && currentState !== null ? currentState : {}), msavdoProductModal: true },
      '',
      window.location.href,
    );
    const closeOnBack = (event: PopStateEvent) => {
      if (!event.state?.msavdoProductModal) setSelectedProduct(null);
    };
    window.addEventListener('popstate', closeOnBack);
    return () => {
      window.removeEventListener('popstate', closeOnBack);
      const currentHistoryState = window.history.state;
      if (currentHistoryState?.msavdoPhotoZoom) {
        const nextHistoryState = { ...currentHistoryState };
        delete nextHistoryState.msavdoPhotoZoom;
        delete nextHistoryState.msavdoProductModal;
        window.history.replaceState(nextHistoryState, '', window.location.href);
      }
      if (window.history.state?.msavdoProductModal) window.history.back();
    };
  }, [isProductModalOpen]);

  // Корзина на клиенте
  const [initialCart] = useState<{ items: CartItem[]; restoreError: boolean }>(() => {
    try {
      const saved = localStorage.getItem('msavdo_cart_v2');
      const parsed = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed) || !parsed.every((item) => item && typeof item === 'object'
        && typeof item.id === 'string' && Number.isSafeInteger(item.product_id)
        && Number.isSafeInteger(item.quantity) && item.quantity > 0)) throw new Error('Invalid saved cart');
      return { items: mergeCartItems(parsed), restoreError: false };
    } catch (error) {
      console.error('[Cart] Could not restore saved cart:', error);
      return { items: [], restoreError: true };
    }
  });
  const [cart, setCart] = useState<CartItem[]>(initialCart.items);
  const [cartStorageError, setCartStorageError] = useState(initialCart.restoreError);

  useEffect(() => {
    if (initialCart.restoreError) return;
    try {
      localStorage.setItem('msavdo_cart_v2', JSON.stringify(cart));
      setCartStorageError(false);
    } catch (error) {
      console.error('[Cart] Could not save cart:', error);
      setCartStorageError(true);
    }
  }, [cart, initialCart.restoreError]);

  // Гарантированное удаление старых плавающих виджетов Co-Pilot
  useEffect(() => {
    const cleanupCopilotWidgets = () => {
      const ids = ['msavdo-floating-container', 'msavdo-edge-tab'];
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
      document.querySelectorAll('#msavdo-floating-container, #msavdo-edge-tab').forEach((el) => el.remove());
    };

    cleanupCopilotWidgets();
    const interval = setInterval(cleanupCopilotWidgets, 800);
    return () => clearInterval(interval);
  }, []);

  // Безопасное получение JSON с защитой от HTML / Vite SPA fallback
  const safeFetchJson = async (url: string, options?: RequestInit) => {
    const res = await apiFetch(url, options);
    if (!res.ok) {
      throw new Error(`Ошибка сервера HTTP ${res.status}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const rawText = await res.text();
      if (rawText.trim().startsWith('<')) {
        throw new Error('Служба инициализируется (получен HTML-ответ). Повторное подключение...');
      }
      try {
        return JSON.parse(rawText);
      } catch {
        throw new Error('Некорректный формат данных сервера');
      }
    }
    return res.json();
  };

  const loadSecondaryCatalogData = async (signal?: AbortSignal) => {
    const [categoryResult, settingsResult] = await Promise.allSettled([
      safeFetchJson('/api/categories', signal ? { signal } : undefined),
      safeFetchJson('/api/settings', signal ? { signal } : undefined),
    ]);
    if (signal?.aborted) return;
    if (categoryResult.status === 'fulfilled') {
      setCategoriesTree(categoryResult.value?.tree || categoryResult.value?.categories || []);
    } else {
      console.warn('[M.Savdo] Категории временно недоступны:', categoryResult.reason);
    }
    if (settingsResult.status === 'fulfilled') {
      if (settingsResult.value?.whatsapp_phone) setWhatsappPhone(settingsResult.value.whatsapp_phone);
    } else {
      console.warn('[M.Savdo] Настройки временно недоступны:', settingsResult.reason);
    }
  };

  const fetchProducts = async (append = false) => {
    const requestId = ++catalogRequestId.current;
    if (append) setIsLoadingMore(true);
    else setIsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '24',
        offset: append ? String(products.length) : '0',
        sort: sortBy,
      });
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (selectedCategoryId !== null) params.set('category_id', String(selectedCategoryId));
      if (deliveryFilter !== 'all') params.set('delivery_type', deliveryFilter);

      const data = await safeFetchJson(`/api/products?${params.toString()}`);
      if (requestId !== catalogRequestId.current) return;
      if (!Array.isArray(data?.products)) throw new Error('Сервер не вернул список товаров');
      const page = data.products as Product[];
      setCatalogError(null);
      if (!page.slice(0, 2).some((product) => product.main_image)) {
        window.dispatchEvent(new Event('msavdo:primary-image-ready'));
      }
      setProducts((current) => append
        ? [...current, ...page.filter((product) => !current.some((item) => item.id === product.id))]
        : page);
      setTotalProductCount(Number(data?.total) || 0);
      if (data?.delivery_counts) {
        setDeliveryCounts({
          all: Number(data.delivery_counts.all) || 0,
          order: Number(data.delivery_counts.order) || 0,
          stock: Number(data.delivery_counts.stock) || 0,
        });
      }
      setHasMoreProducts(Boolean(data?.has_more));
    } catch (error) {
      if (requestId === catalogRequestId.current) {
        console.error('[Catalog Loading Error]', error);
        setCatalogError(append ? 'more' : 'initial');
        addToast('error', t('catalogLoadError'), t('catalogLoadRetry'));
      }
    } finally {
      if (requestId === catalogRequestId.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    void fetchProducts();

    // Проверка URL параметра для скрытого служебного входа (?admin=true)
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true' || params.get('manage') === '1') {
      setCurrentView('admin');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadSecondaryCatalogData(controller.signal), 18000);
    const loadAfterPrimaryImage = () => {
      window.clearTimeout(timer);
      void loadSecondaryCatalogData(controller.signal);
    };
    window.addEventListener('msavdo:primary-image-ready', loadAfterPrimaryImage, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('msavdo:primary-image-ready', loadAfterPrimaryImage);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const productId = Number(new URLSearchParams(window.location.search).get('product'));
    if (!Number.isSafeInteger(productId) || productId <= 0) return;

    const controller = new AbortController();
    apiFetch(`/api/products/${productId}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Не удалось открыть товар (${response.status})`);
        return response.json();
      })
      .then((data) => {
        if (controller.signal.aborted || !data?.product) return;
        handleOpenProduct(data.product as Product);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('[Product Deep Link Error]', error);
          addToast('error', 'Не удалось открыть товар', 'Попробуйте перейти в каталог и выбрать товар ещё раз.');
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const sendVisit = async () => {
      let deviceModel = '';
      const navigatorWithHints = navigator as Navigator & {
        userAgentData?: {
          getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }>;
        };
      };
      if (navigatorWithHints.userAgentData?.getHighEntropyValues) {
        try {
          const hints = await navigatorWithHints.userAgentData.getHighEntropyValues(['model']);
          deviceModel = hints.model?.trim().slice(0, 80) || '';
        } catch (error) {
          console.warn('[Device Model Detection Error]', error);
        }
      }

      apiFetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_model: deviceModel }),
        keepalive: true,
      }).catch((error) => console.error('[Site Visit Tracking Error]', error));
    };
    let visitSent = false;
    const sendVisitOnce = () => {
      if (visitSent) return;
      visitSent = true;
      void sendVisit();
    };
    const timer = window.setTimeout(sendVisitOnce, 18000);
    const sendVisitAfterPrimaryImage = () => {
      window.clearTimeout(timer);
      sendVisitOnce();
    };
    window.addEventListener('msavdo:primary-image-ready', sendVisitAfterPrimaryImage, { once: true });
    window.addEventListener('pagehide', sendVisitOnce, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('msavdo:primary-image-ready', sendVisitAfterPrimaryImage);
      window.removeEventListener('pagehide', sendVisitOnce);
    };
  }, []);

  const initialCatalogFilters = useRef(true);
  useEffect(() => {
    if (initialCatalogFilters.current) {
      initialCatalogFilters.current = false;
      return;
    }
    catalogRequestId.current += 1;
    setCatalogError(null);
    setIsLoading(true);
    const timer = window.setTimeout(() => { void fetchProducts(); }, searchQuery ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [searchQuery, selectedCategoryId, deliveryFilter, sortBy]);

  useEffect(() => {
    if (!isSearchFocused) return;
    const controller = new AbortController();
    const query = searchQuery.trim();
    setSearchHints({ suggestions: [], popular: [] });
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      apiFetch(`/api/search/suggestions?${params.toString()}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Search suggestions request failed: ${response.status}`);
          const data = await response.json();
          if (controller.signal.aborted) return;
          setSearchHints({
            suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
            popular: Array.isArray(data?.popular) ? data.popular : [],
          });
        })
        .catch((error) => {
          if (error.name !== 'AbortError') {
            console.error('[Search Suggestions Error]', error);
          }
        });
    }, 140);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, isSearchFocused]);

  useEffect(() => {
    const query = searchQuery.trim().replace(/\s+/g, ' ');
    if (query.length < 2 || query === lastTrackedSearch.current) return;
    const timer = window.setTimeout(() => {
      lastTrackedSearch.current = query;
      apiFetch('/api/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      }).then((response) => {
        if (!response.ok) throw new Error(`Search tracking request failed: ${response.status}`);
      }).catch((error) => console.error('[Search Tracking Error]', error));
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [searchQuery, isSearchFocused]);

  useEffect(() => {
    if (selectedCategoryId === null) {
      setRecommendedProducts([]);
      return;
    }

    const controller = new AbortController();
    apiFetch(`/api/categories/${selectedCategoryId}/recommendations`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Recommendations request failed: ${response.status}`);
        const data = await response.json();
        setRecommendedProducts(Array.isArray(data?.products) ? data.products : []);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('[Category Recommendations Error]', error);
          setRecommendedProducts([]);
        }
      });
    return () => controller.abort();
  }, [selectedCategoryId]);

  // Добавление в корзину конкретного варианта
  const handleAddToCart = (item: CartItem): boolean => {
    const itemWithVariants = {
      ...item,
      variants: products.find((product) => product.id === item.product_id)?.variants || item.variants || [],
    };
    const updated = addCartItem(cart, itemWithVariants);
    if (!updated) {
      addToast('error', t('cartLimit'));
      return false;
    }
    setCart(updated);
    addToast('success', 'Товар добавлен в корзину', `${itemWithVariants.title} · ${itemWithVariants.quantity} шт. (${itemWithVariants.color}, ${itemWithVariants.size})`);
    return true;
  };

  const handleUpdateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            if (delta > 0 && newQty > MAX_CART_QUANTITY) return item;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const handleAddCartVariant = (
    itemId: string,
    variant: NonNullable<Product['variants']>[number],
  ) => {
    const selectedItem = cart.find((item) => item.id === itemId);
    if (!selectedItem) return;
    const nextItem: CartItem = {
      ...selectedItem,
      id: `${selectedItem.product_id}-${variant.id}`,
      variant_id: variant.id,
      variant_sku: variant.variant_sku,
      color: variant.color,
      size: variant.size,
      price_tjs: variant.price_tjs,
      original_price_tjs: variant.original_price_tjs,
      quantity_discount_min: variant.quantity_discount_min,
      quantity_discount_percent: variant.quantity_discount_percent,
      stock: variant.stock,
      image: variant.image_url || selectedItem.image,
      quantity: 1,
    };
    const updated = addCartItem(cart, nextItem);
    if (!updated) {
      addToast('error', t('cartLimit'));
      return;
    }
    setCart(updated);
  };

  const handleRemoveFromCart = (id: string) => {
    const removed = cart.find((item) => item.id === id);
    if (!removed) return;
    setRemovedCartItem(removed);
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const handleRestoreCartItem = () => {
    if (!removedCartItem) return;
    const updated = addCartItem(cart, removedCartItem);
    if (!updated) {
      addToast('error', t('cartLimit'));
      return;
    }
    setCart(updated);
    setRemovedCartItem(null);
  };

  const handleClearCart = () => {
    setCart([]);
    setRemovedCartItem(null);
  };

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const whatsAppHelpPopup = showWhatsAppHelp && !dismissedWhatsAppHelp && currentView === 'catalog'
    && !isCartOpen && !isProductModalOpen ? (
      <div className="relative w-64 rounded-2xl border border-emerald-100 bg-white p-3.5 text-left text-slate-800 shadow-xl ring-1 ring-black/5">
        <button
          type="button"
          onClick={closeWhatsAppHelp}
          aria-label={t('close')}
          className="absolute right-2 top-2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <p className="pr-5 text-xs font-semibold leading-relaxed">{t('whatsappHelpPrompt')}</p>
        <a
          href={whatsappHelpUrl}
          target="_blank"
          rel="noreferrer"
          onClick={closeWhatsAppHelp}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {t('whatsappHelpAction')}
        </a>
        <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-emerald-100 bg-white" />
      </div>
    ) : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased selection:bg-amber-400 selection:text-black font-sans pb-16 md:pb-0">
      
      {/* Глобальные UI-уведомления (Toasts) */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* ======================================================== */}
      {/* 1. ШАПКА МАГАЗИНА: ЖЕЛТО-ЧЕРНЫЙ СТИЛЬ M.SAVDO */}
      {/* Строгая клиентская изоляция: никаких кнопок импорта или ссылок на Китай */}
      {/* ======================================================== */}
      <header className="sticky top-0 z-40 bg-[#f4c542] text-slate-950 border-b border-[#deb02b] shadow-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 min-h-14 sm:min-h-[76px] py-2 flex items-center gap-2 sm:gap-6">
          
          <div 
            onClick={() => {
              setCurrentView('catalog');
              setSelectedCategoryId(null);
              setSearchQuery('');
            }}
            className="cursor-pointer flex items-center gap-1.5 sm:gap-3 shrink-0 select-none group"
          >
            <div className="relative w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl overflow-hidden border border-black/10 shadow-md shrink-0 bg-[#f4c542] flex items-center justify-center">
              <img 
                src={BRAND_LOGO_URL} 
                alt="MSavdo" 
                className="w-full h-full object-contain group-hover:scale-105 transition-transform"
              />
            </div>
            <span className="text-base sm:text-2xl font-black tracking-tight text-slate-950 font-heading">MSavdo</span>
          </div>

          {currentView === 'catalog' && (
            <div className="relative min-w-0 flex-1 max-w-3xl md:ml-auto">
              <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setIsSearchFocused(false), 120)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setIsSearchFocused(false);
                    searchInputRef.current?.blur();
                  }
                  if (event.key === 'Escape') setIsSearchFocused(false);
                }}
                placeholder={t('searchProducts')}
                aria-label={t('searchProducts')}
                className="w-full h-9 sm:h-11 rounded-lg sm:rounded-xl border border-black/10 bg-white/95 pl-8 sm:pl-9 pr-8 text-[11px] sm:text-sm font-medium text-slate-900 placeholder:text-slate-500 shadow-sm outline-none transition focus:ring-2 focus:ring-slate-900/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label={t('clearSearch')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              {isSearchFocused && (searchHints.suggestions.length > 0 || searchHints.popular.length > 0) && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[60vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                  {searchHints.suggestions.length > 0 && (
                    <div className="mb-1">
                      <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{t('searchSuggestions')}</p>
                      {searchHints.suggestions.map((suggestion) => (
                        <button
                          key={`suggestion-${suggestion}`}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setSearchQuery(suggestion);
                            setIsSearchFocused(false);
                            searchInputRef.current?.blur();
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-slate-700 hover:bg-amber-50"
                        >
                          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="line-clamp-1">{suggestion}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchHints.popular.length > 0 && (
                    <div>
                      <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{t('popularSearches')}</p>
                      {searchHints.popular.map((item) => (
                        <button
                          key={`popular-${item.query_text}`}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setSearchQuery(item.query_text);
                            setIsSearchFocused(false);
                            searchInputRef.current?.blur();
                          }}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs text-slate-700 hover:bg-amber-50"
                        >
                          <span className="line-clamp-1">{item.query_text}</span>
                          <span className="shrink-0 text-[10px] text-slate-400">{item.searches_count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  aria-label={t('settingsTitle')}
                  title={t('settingsTitle')}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-950 transition hover:bg-black/10"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </div>
        </div>
      </header>
      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal isOpen onClose={closeSettings} />
        </Suspense>
      )}

      {/* ======================================================== */}
      {/* 2. ОСНОВНОЙ КОНТЕНТ */}
      {/* ======================================================== */}
      <main className={`flex-1 max-w-7xl w-full mx-auto px-2.5 sm:px-6 lg:px-8 pb-2.5 sm:pb-6 ${currentView === 'catalog' ? 'pt-1 sm:pt-1.5' : 'pt-2.5 sm:pt-6'}`}>
        
        {/* ЭКРАН 1: ПРАВИЛА СЕРВИСА */}
        {currentView === 'rules' && (
          <Suspense fallback={<div className="p-6 text-center text-sm text-slate-500">Загрузка…</div>}>
            <RulesView
              onBack={() => setCurrentView('catalog')}
              onOpenCart={() => setIsCartOpen(true)}
            />
          </Suspense>
        )}

        {/* ЭКРАН 2: АДМИН-ПАНЕЛЬ (ТОЛЬКО ЗДЕСЬ ИМПОРТ И УПРАВЛЕНИЕ) */}
        {currentView === 'admin' && (
          <Suspense fallback={<div className="p-6 text-center text-sm text-slate-500">Загрузка панели администратора…</div>}>
            <AdminPanel
              onBack={() => setCurrentView('catalog')}
              onRefreshCatalog={() => { void fetchProducts(); void loadSecondaryCatalogData(); }}
            />
          </Suspense>
        )}

        {/* ЭКРАН 3: ПУБЛИЧНЫЙ КАТАЛОГ (КОМПАКТНЫЙ, БЫСТРЫЙ, МОБИЛЬНЫЙ) */}
        {currentView === 'catalog' && (
          <div className="space-y-2 sm:space-y-4">
            {publicOffers.length > 0 && <section className="flex gap-2 overflow-x-auto py-1" aria-label="Предложения">
              {publicOffers.map((offer) => <div key={offer.id} className="shrink-0 rounded-xl bg-amber-100 px-4 py-2 text-xs font-semibold text-amber-950">{offer.title}</div>)}
            </section>}
            
            {/* Compact category sections: icons belong to sections, not their subcategories. */}
            <section aria-label={t('allCategories')} className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new Event('msavdo:primary-image-ready'));
                  setIsCategoriesOpen((open) => !open);
                }}
                aria-expanded={isCategoriesOpen}
                className="flex h-7 max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-800 transition-colors hover:border-amber-400"
              >
                <span aria-hidden="true">☰</span>
                <span className="truncate">
                  {selectedCategoryId === null
                    ? t('allCategories')
                    : (categoriesTree.flatMap((c) => [c, ...(c.subcategories || [])]).find((c) => c.id === selectedCategoryId)?.name || t('allCategories'))}
                </span>
                <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${isCategoriesOpen ? 'rotate-180' : ''}`} />
              </button>
              {isCategoriesOpen && (
              <div className="grid w-max max-w-full auto-cols-[132px] grid-flow-col grid-rows-2 gap-1 overflow-x-auto pb-1 scrollbar-none sm:auto-cols-[160px]">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategoryId(null);
                    setExpandedCategoryId(null);
                    setIsCategoriesOpen(false);
                  }}
                  aria-pressed={selectedCategoryId === null}
                  className={`flex h-7 min-w-0 items-center gap-1 rounded-md border px-1.5 py-1 text-left transition-colors ${
                    selectedCategoryId === null
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-amber-400'
                  }`}
                >
                  <span className="text-xs leading-none" aria-hidden="true">🛍️</span>
                  <span className="truncate text-[10px] font-bold">{t('allCategories')}</span>
                </button>

                {categoriesTree.map((section) => {
                  const isSelected = selectedCategoryId === section.id
                    || section.subcategories?.some((category) => category.id === selectedCategoryId) === true;
                  const isExpanded = expandedCategoryId === section.id;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => {
                        setSelectedCategoryId(section.id);
                        setExpandedCategoryId(isExpanded ? null : section.id);
                      }}
                      aria-pressed={isSelected}
                      title={section.name}
                      className={`flex h-7 min-w-0 items-center gap-1 rounded-md border px-1.5 py-1 text-left transition-colors ${
                        isSelected
                          ? 'border-amber-500 bg-amber-100 text-slate-950 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-amber-400'
                      }`}
                    >
                      <span className="text-xs leading-none" aria-hidden="true">{getCategoryIllustration(section.name)}</span>
                      <span className="truncate text-[9px] font-bold leading-tight">{section.name}</span>
                      {section.subcategories && section.subcategories.length > 0 && (
                        <ChevronDown className={`h-2.5 w-2.5 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      )}
                    </button>
                  );
                })}
              </div>
              )}

              {isCategoriesOpen && expandedCategoryId !== null && (() => {
                const section = categoriesTree.find((category) => category.id === expandedCategoryId);
                if (!section?.subcategories?.length) return null;
                return (
                  <div className="grid grid-cols-2 gap-1 py-0.5 sm:grid-cols-3">
                    {section.subcategories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => {
                          setSelectedCategoryId(selectedCategoryId === category.id ? section.id : category.id);
                          setIsCategoriesOpen(false);
                        }}
                        aria-pressed={selectedCategoryId === category.id}
                        title={category.name}
                        className={`min-w-0 truncate rounded-md px-1.5 py-1 text-left text-[9px] font-semibold transition-colors ${
                          selectedCategoryId === category.id
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-slate-900'
                        }`}
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </section>

            {/* Компактный единый фильтр доставки */}
            <div className="flex max-w-full items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[10px] sm:text-xs font-semibold">
              <button
                onClick={() => setDeliveryFilter('all')}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 transition-colors ${deliveryFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {t('allProducts')}
                {deliveryCounts && <span className="ml-1 text-[8px] font-medium opacity-70">({deliveryCounts.all})</span>}
              </button>
              <button
                onClick={() => setDeliveryFilter('order')}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 transition-colors ${deliveryFilter === 'order' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {t('delivery18to30')}
                {deliveryCounts && <span className="ml-1 text-[8px] font-medium opacity-70">({deliveryCounts.order})</span>}
              </button>
              <button
                onClick={() => setDeliveryFilter('stock')}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 transition-colors ${deliveryFilter === 'stock' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {t('inStockOneDay')}
                {deliveryCounts && <span className="ml-1 text-[8px] font-medium opacity-70">({deliveryCounts.stock})</span>}
              </button>
            </div>

            {/* ПАНЕЛЬ СОРТИРОВКИ МАРКЕТПЛЕЙСА (ТРЕБОВАНИЕ 7) */}
            <div className="flex items-center justify-between gap-2 pt-1 pb-1 border-b border-slate-200">
              <div className="text-[11px] sm:text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <span>{t('foundProducts')}</span>
                <span className="font-bold text-slate-900 font-mono">{totalProductCount}</span>
              </div>

              <div className="relative flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
                <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
                <select
                  aria-label={t('sortProducts')}
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
                  className="max-w-[155px] appearance-none bg-transparent pr-4 text-[10px] sm:text-xs font-semibold text-slate-700 outline-none"
                >
                  <option value="popular">{t('popular')}</option>
                  <option value="price_asc">{t('cheapest')}</option>
                  <option value="price_desc">{t('expensive')}</option>
                  <option value="newest">{t('newest')}</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-slate-500" />
              </div>
            </div>

            {/* СЕТКА ТОВАРОВ: 2 КОЛОНКИ НА СМАРТФОНАХ (ЧЕТКО И КРАСИВО) */}
            <section>
              {isLoading ? (
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-2 sm:gap-2 md:grid-cols-3 xl:grid-cols-4">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="overflow-hidden rounded-sm border border-slate-200 bg-white animate-pulse">
                      <div className="aspect-square bg-slate-200" />
                      <div className="space-y-2 p-2">
                        <div className="h-4 bg-slate-200 rounded w-3/4" />
                        <div className="h-3 bg-slate-100 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : catalogError === 'initial' ? (
                <div role="alert" className="mx-auto my-6 max-w-lg space-y-3 rounded-xl border border-slate-200 bg-white p-6 text-center">
                  <h3 className="text-sm font-bold text-slate-900">{t('catalogLoadError')}</h3>
                  <p className="text-xs text-slate-500">{t('catalogLoadRetry')}</p>
                  <button type="button" onClick={() => void fetchProducts()}
                    className="min-h-10 rounded-lg bg-amber-400 px-4 text-xs font-bold text-black">{t('retry')}</button>
                </div>
              ) : products.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-12 text-center space-y-3 shadow-xs max-w-lg mx-auto my-6">
                  <Package className="w-10 h-10 text-amber-500 mx-auto" />
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    {t('noProducts')}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {t('changeSearch')}
                  </p>
                  <button
                    onClick={() => {
                      setSelectedCategoryId(null);
                      setSearchQuery('');
                      setDeliveryFilter('all');
                    }}
                    className="mt-2 px-4 py-2 bg-black text-amber-400 rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors"
                  >
                    {t('showCatalog')}
                  </button>
                  {searchQuery.trim() && (
                    <div>
                      <a
                        href={`https://wa.me/${whatsappPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`${t('searchHelpMessage')} ${searchQuery.trim().slice(0, 120)}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-800"
                      >
                        <MessageCircle className="h-4 w-4" />
                        {t('searchHelpAction')}
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-2 sm:gap-2 md:grid-cols-3 xl:grid-cols-4">
                  {products.map((product, index) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      isPriority={index < 2}
                      onPriorityImageReady={() => window.dispatchEvent(new Event('msavdo:primary-image-ready'))}
                      onSelect={(p) => handleOpenProduct(p)}
                    />
                  ))}
                </div>
              )}
            </section>

            {catalogError === 'more' && (
              <p role="alert" className="text-center text-xs text-red-700">{t('catalogLoadError')} {t('catalogLoadRetry')}</p>
            )}
            {hasMoreProducts && (
              <button
                type="button"
                onClick={() => { void fetchProducts(true); }}
                disabled={isLoadingMore}
                className="mx-auto flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-5 text-xs font-bold text-slate-700 transition hover:border-amber-400 disabled:opacity-60"
              >
                {isLoadingMore ? t('loadingMore') : t('loadMore')}
              </button>
            )}

            {selectedCategoryId !== null && recommendedProducts.length > 0 && (
              <section className="space-y-3 border-t border-slate-200 pt-4">
                <h2 className="text-sm font-bold text-slate-900">{t('relatedBranchProducts')}</h2>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 sm:gap-2 md:grid-cols-4">
                  {recommendedProducts
                    .filter((product) => !products.some((current) => current.id === product.id))
                    .map((product) => (
                      <ProductCard
                        key={`related-${product.id}`}
                        product={product}
                        onSelect={handleOpenProduct}
                      />
                    ))}
                </div>
              </section>
            )}

          </div>
        )}

      </main>

      {isCategoryBrowserOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setIsCategoryBrowserOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={t('categoryBrowse')}
            className="flex max-h-[88dvh] w-full max-w-xl flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center gap-3 border-b border-slate-200 p-4">
              {browsingCategoryId !== null && (
                <button
                  type="button"
                  onClick={() => setBrowsingCategoryId(null)}
                  aria-label={t('backToCatalog')}
                  className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                >
                  <ChevronDown className="h-4 w-4 rotate-90" />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-heading text-base font-bold text-slate-900">
                  {t('categoryBrowse')}
                </h2>
                <p className="truncate text-xs text-slate-500">
                  {browsingCategoryId === null
                    ? t('chooseCategory')
                    : categoriesTree.find((category) => category.id === browsingCategoryId)?.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCategoryBrowserOpen(false)}
                aria-label={t('close')}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="overflow-y-auto overscroll-contain p-3">
              {browsingCategoryId === null ? (
                <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                  {categoriesTree.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setBrowsingCategoryId(section.id)}
                      className="flex min-h-12 min-w-0 items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-left transition hover:border-amber-400 hover:bg-amber-50"
                    >
                      <span className="text-base" aria-hidden="true">{getCategoryIllustration(section.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10px] font-bold text-slate-800">{section.name}</span>
                        <span className="block text-[9px] text-slate-500">{t('categoryProductCount')}: {section.product_count || 0}</span>
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-slate-400" />
                    </button>
                  ))}
                </div>
              ) : (() => {
                const section = categoriesTree.find((category) => category.id === browsingCategoryId);
                if (!section) return null;
                return (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategoryId(section.id);
                        setIsCategoryBrowserOpen(false);
                        setBrowsingCategoryId(null);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="flex w-full items-center justify-between rounded-lg bg-slate-900 px-3 py-2 text-left text-[10px] font-bold text-white"
                    >
                      <span>{t('showSectionProducts')}</span>
                      <span>{t('categoryProductCount')}: {section.product_count || 0}</span>
                    </button>
                    {section.subcategories?.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => {
                          setSelectedCategoryId(category.id);
                          setExpandedCategoryId(section.id);
                          setIsCategoryBrowserOpen(false);
                          setBrowsingCategoryId(null);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-left text-[10px] font-semibold text-slate-700 transition hover:border-amber-400 hover:bg-amber-50"
                      >
                        <span className="min-w-0 truncate">{category.name}</span>
                        <span className="shrink-0 text-[9px] font-medium text-slate-500">{t('categoryProductCount')}: {category.product_count || 0}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          </section>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. МОДАЛЬНЫЕ ОКНА */}
      {/* ======================================================== */}
      
      {/* Карточка товара */}
      {selectedProduct && (
        <Suspense fallback={null}>
          <ProductDetailModal
            key={selectedProduct.id}
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            onAddToCart={handleAddToCart}
            onOrderNow={(item) => {
              if (handleAddToCart(item)) {
                setSelectedProduct(null);
                setIsCartOpen(true);
              }
            }}
            onSelectRelatedProduct={handleOpenProduct}
          />
        </Suspense>
      )}

      {/* Корзина */}
      {isCartOpen && (
        <Suspense fallback={null}>
          <CartDrawer
            isOpen
            onClose={() => setIsCartOpen(false)}
            items={cart}
            products={products}
            onUpdateQuantity={handleUpdateQuantity}
            onAddVariant={handleAddCartVariant}
            onRemoveItem={handleRemoveFromCart}
            onClearCart={handleClearCart}
            cartStorageError={cartStorageError}
            removedItem={removedCartItem}
            onRestoreItem={handleRestoreCartItem}
            onOpenRules={() => {
              setIsCartOpen(false);
              setCurrentView('rules');
            }}
            whatsappPhone={whatsappPhone}
          />
        </Suspense>
      )}

      {/* ======================================================== */}
      {/* 4. МОБИЛЬНАЯ НИЖНЯЯ ПАНЕЛЬ НАВИГАЦИИ (ФИКСИРОВАННАЯ) */}
      {/* ======================================================== */}
      {currentView === 'catalog' && (
        <>
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            aria-label={`${t('cart')}: ${totalCartCount}`}
            className="fixed bottom-6 right-6 z-40 hidden h-12 w-12 items-center justify-center rounded-full bg-[#f4c542] text-slate-950 shadow-xl ring-1 ring-black/10 transition hover:scale-105 active:scale-95 md:flex"
          >
            <ShoppingBasket className="h-5 w-5" />
            {totalCartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-bold text-white">
                {totalCartCount}
              </span>
            )}
          </button>
          <a
            href={`https://wa.me/${whatsappPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Ассаламу Алайкум!')}`}
            target="_blank"
            rel="noreferrer"
            aria-label={t('whatsapp')}
            className="fixed bottom-6 left-6 z-40 hidden h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl ring-1 ring-black/10 transition hover:scale-105 hover:bg-emerald-700 active:scale-95 md:flex"
          >
            <MessageCircle className="h-5 w-5" />
          </a>
          {whatsAppHelpPopup && (
            <div className="fixed bottom-20 left-4 z-50 hidden md:block">
              {whatsAppHelpPopup}
            </div>
          )}
        </>
      )}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-black text-white border-t border-zinc-800 px-4 py-2 flex items-center justify-around shadow-2xl">
        <button
          onClick={() => {
            window.dispatchEvent(new Event('msavdo:primary-image-ready'));
            setCurrentView('catalog');
            setSelectedCategoryId(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center gap-1 ${currentView === 'catalog' ? 'text-amber-400' : 'text-zinc-400'}`}
        >
          <Home className="w-4 h-4" />
          <span className="text-[10px] font-bold">{t('catalog')}</span>
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(new Event('msavdo:primary-image-ready'));
            setCurrentView('catalog');
            setBrowsingCategoryId(null);
            setIsCategoryBrowserOpen(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex flex-col items-center gap-1 text-zinc-400"
        >
          <Search className="w-4 h-4" />
          <span className="text-[10px] font-bold">{t('search')}</span>
        </button>

        <div className="relative flex flex-col items-center gap-1">
          {whatsAppHelpPopup && (
            <div className="absolute bottom-[calc(100%+0.75rem)] left-1/2 z-50 -translate-x-1/2">
              {whatsAppHelpPopup}
            </div>
          )}
          <a
            href={`https://wa.me/${whatsappPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Ассаламу Алайкум!')}`}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col items-center gap-1 text-emerald-400"
          >
            <MessageCircle className="w-4 h-4" />
            <span className="text-[10px] font-bold">{t('whatsapp')}</span>
          </a>
        </div>

        <button
          onClick={() => setIsCartOpen(true)}
          className="relative flex flex-col items-center gap-1 text-amber-400 font-bold"
        >
          <div className="relative">
            <ShoppingBasket className="w-4 h-4" />
            {totalCartCount > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-amber-400 text-black text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                {totalCartCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold">{t('cart')}</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* 5. ФУТЕР (ПРЕМИАЛЬНЫЙ ЖЕЛТО-ЧЕРНЫЙ БРЕНДИНГ + СКРЫТЫЙ СЛУЖЕБНЫЙ ВХОД) */}
      {/* ======================================================== */}
      <footer className="bg-black text-white border-t border-zinc-800 mt-16 pt-8 pb-24 md:pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-400">
          
          <div className="flex items-center gap-3">
            <img 
              src={BRAND_LOGO_URL} 
              alt="M.Savdo" 
              className="w-7 h-7 rounded-lg object-cover border border-amber-400"
            />
            <div>
              <span className="font-black text-white">MSavdo</span> · Маркази Савдо · Сервис выкупа фабричных товаров
              <span className="text-zinc-600 block sm:inline sm:ml-2">Instagram: <strong className="text-amber-400">@MSavdo.tj</strong></span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4 sm:items-end">
            <div className="flex items-center gap-5">
            <a href="/catalog/1" className="hover:text-amber-400 transition-colors">
              Каталог товаров
            </a>
            <button 
              onClick={() => setCurrentView('rules')} 
              className="hover:text-amber-400 transition-colors"
            >
              {t('rules')}
            </button>
            <a 
              href="https://instagram.com/MSavdo.tj" 
              target="_blank" 
              rel="noreferrer"
              className="text-amber-400 hover:underline"
            >
              @MSavdo.tj
            </a>
            
            {/* Скрытый дискретный служебный вход: только для владельца магазина */}
            <button 
              onClick={() => setCurrentView('admin')} 
              className="text-zinc-600 hover:text-zinc-400 transition-colors p-1"
              title="Панель владельца"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
            </div>
            <nav aria-label="Социальные сети M.Savdo" className="flex items-center gap-3">
              <a
                href="https://t.me/MSavdoTJ"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="M.Savdo в Telegram"
                title="Telegram"
                className="rounded-full border border-zinc-700 p-2 text-zinc-300 transition hover:border-sky-400 hover:text-sky-400"
              >
                <Send className="h-4 w-4" />
              </a>
              <a
                href="https://instagram.com/MSavdo.tj"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="M.Savdo в Instagram"
                title="Instagram"
                className="rounded-full border border-zinc-700 p-2 text-zinc-300 transition hover:border-pink-400 hover:text-pink-400"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href="https://www.youtube.com/@MSavdoTJ"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="M.Savdo на YouTube"
                title="YouTube"
                className="rounded-full border border-zinc-700 p-2 text-zinc-300 transition hover:border-red-500 hover:text-red-500"
              >
                <Youtube className="h-4 w-4" />
              </a>
            </nav>
          </div>

        </div>
      </footer>

    </div>
  );
}
