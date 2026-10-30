/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Product, Category, CartItem } from './types';
import { ProductCard } from './components/ProductCard';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { RulesView } from './components/RulesView';
import { AdminPanel } from './components/AdminPanel';
import { ToastContainer, ToastItem } from './components/Toast';
import { ImageSearchModal } from './components/ImageSearchModal';
import { apiFetch } from './api';
import { 
  Search, 
  ShoppingBag, 
  Package, 
  Lock,
  X,
  MessageCircle,
  Home,
  CheckCircle2,
  ExternalLink,
  Camera,
  Sparkles
} from 'lucide-react';

const BRAND_LOGO_URL = "/assets/aistudio/photo_2026-06-11_22-16-50_6464a600.jpg";

export default function App() {
  const [currentView, setCurrentView] = useState<'catalog' | 'rules' | 'admin'>('catalog');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isImageSearchOpen, setIsImageSearchOpen] = useState(false);

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
  const [categoriesTree, setCategoriesTree] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [whatsappPhone, setWhatsappPhone] = useState('992444431');

  // Фильтры, живой поиск и сортировка (Требование 7)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | 'stock' | 'order'>('all');
  const [sortBy, setSortBy] = useState<'popular' | 'price_asc' | 'price_desc' | 'newest'>('popular');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const viewedProductIds = useRef<Set<number>>(new Set());

  // Открытие карточки товара с автоматическим счетчиком просмотров
  const handleOpenProduct = (p: Product) => {
    setSelectedProduct(p);
    if (!viewedProductIds.current.has(p.id)) {
      viewedProductIds.current.add(p.id);
      apiFetch(`/api/products/${p.id}/view`, { method: 'POST' })
        .then((res) => res.json())
        .then((data) => {
          if (data?.views_count) {
            setProducts((prev) =>
              prev.map((item) => (item.id === p.id ? { ...item, views_count: data.views_count } : item))
            );
            setSelectedProduct((prev) => (prev?.id === p.id ? { ...prev, views_count: data.views_count } : prev));
          }
        })
        .catch(() => {});
    }
  };

  // Корзина на клиенте
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('msavdo_cart_v2');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('msavdo_cart_v2', JSON.stringify(cart));
    } catch {
      // Игнорируем ошибку квоты
    }
  }, [cart]);

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

  // Загрузка каталога с глобальным перехватом ошибок и авто-повтором
  const fetchCatalog = async (retryCount = 0) => {
    if (products.length === 0) {
      setIsLoading(true);
    }
    try {
      // 1. Товары
      const dataProducts = await safeFetchJson('/api/products');
      if (Array.isArray(dataProducts?.products)) {
        setProducts(dataProducts.products);
      }

      // 2. Категории
      try {
        const dataCategories = await safeFetchJson('/api/categories');
        setCategoriesTree(dataCategories?.tree || dataCategories?.categories || []);
      } catch (catErr) {
        console.warn('[M.Savdo] Категории временно недоступны:', catErr);
      }

      // 3. Контакты
      try {
        const dataSettings = await safeFetchJson('/api/settings');
        if (dataSettings?.whatsapp_phone) {
          setWhatsappPhone(dataSettings.whatsapp_phone);
        }
      } catch (setErr) {
        console.warn('[M.Savdo] Настройки временно недоступны:', setErr);
      }
    } catch (err: any) {
      console.warn(`[M.Savdo] Попытка ${retryCount + 1}/3 загрузки каталога:`, err?.message);
      if (retryCount < 2) {
        // Автоматический повтор через 1.5 секунды, если сервер перезапускался
        setTimeout(() => fetchCatalog(retryCount + 1), 1500);
        return;
      }
      if (products.length === 0) {
        addToast(
          'error',
          'Сбой синхронизации каталога',
          'Каталог обновляется. Пожалуйста, обновите страницу через несколько секунд.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();

    // Проверка URL параметра для скрытого служебного входа (?admin=true)
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true' || params.get('manage') === '1') {
      setCurrentView('admin');
    }
  }, []);

  // Добавление в корзину конкретного варианта
  const handleAddToCart = (item: CartItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, item];
    });
    addToast('success', 'Товар добавлен в корзину', `${item.title} (${item.color}, ${item.size})`);
  };

  const handleUpdateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const handleRemoveFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // Фильтрация и умная сортировка товаров (Требование 7)
  const filteredProducts = useMemo(() => {
    const list = products.filter((p) => {
      if (deliveryFilter === 'stock' && p.delivery_type !== 'stock') return false;
      if (deliveryFilter === 'order' && p.delivery_type === 'stock') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = p.title.toLowerCase().includes(q);
        const skuMatch = p.base_sku.toLowerCase().includes(q);
        const descMatch = (p.description || '').toLowerCase().includes(q);
        if (!titleMatch && !skuMatch && !descMatch) return false;
      }

      if (selectedCategoryId !== null) {
        if (p.category_id === selectedCategoryId) return true;
        const rootCat = categoriesTree.find((c) => c.id === selectedCategoryId);
        if (rootCat && rootCat.subcategories) {
          const subIds = rootCat.subcategories.map((s) => s.id);
          if (p.category_id && subIds.includes(p.category_id)) return true;
        }
        return false;
      }

      return true;
    });

    // Сортировка как в популярных маркетплейсах
    const sorted = [...list];
    if (sortBy === 'popular') {
      sorted.sort((a, b) => (b.views_count || 0) - (a.views_count || 0) || b.id - a.id);
    } else if (sortBy === 'price_asc') {
      sorted.sort((a, b) => (a.min_price_tjs || 0) - (b.min_price_tjs || 0));
    } else if (sortBy === 'price_desc') {
      sorted.sort((a, b) => (b.min_price_tjs || 0) - (a.min_price_tjs || 0));
    } else if (sortBy === 'newest') {
      sorted.sort((a, b) => b.id - a.id);
    }

    return sorted;
  }, [products, searchQuery, selectedCategoryId, deliveryFilter, categoriesTree, sortBy]);

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased selection:bg-amber-400 selection:text-black font-sans pb-16 md:pb-0">
      
      {/* Глобальные UI-уведомления (Toasts) */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* ======================================================== */}
      {/* 1. ШАПКА МАГАЗИНА: ЖЕЛТО-ЧЕРНЫЙ СТИЛЬ M.SAVDO */}
      {/* Строгая клиентская изоляция: никаких кнопок импорта или ссылок на Китай */}
      {/* ======================================================== */}
      <header className="sticky top-0 z-40 bg-black text-white border-b border-zinc-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-18 flex items-center justify-between gap-4">
          
          {/* Бренд с официальным логотипом */}
          <div 
            onClick={() => {
              setCurrentView('catalog');
              setSelectedCategoryId(null);
              setSearchQuery('');
            }}
            className="cursor-pointer flex items-center gap-3 shrink-0 select-none group"
          >
            <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl overflow-hidden border-2 border-amber-400 shadow-sm shrink-0 bg-amber-400 flex items-center justify-center">
              <img 
                src={BRAND_LOGO_URL} 
                alt="MSavdo" 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
            </div>
            
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-white font-heading">
                  M<span className="text-amber-400">Savdo</span>
                </span>
                <span className="bg-amber-400 text-black text-[9px] font-black px-1.5 py-0.5 rounded uppercase">
                  TJ
                </span>
              </div>
              <div className="text-[10px] text-zinc-400 font-medium hidden sm:flex items-center gap-1">
                <span>Каталог фабричных товаров</span>
                <span className="text-zinc-600">·</span>
                <a 
                  href="https://instagram.com/MSavdo.tj" 
                  target="_blank" 
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-amber-400 hover:underline flex items-center gap-0.5"
                >
                  @MSavdo.tj
                </a>
              </div>
            </div>
          </div>

          {/* Навигация для клиентов */}
          <nav className="hidden md:flex items-center gap-6 text-xs sm:text-sm font-bold text-zinc-300">
            <button
              onClick={() => {
                setCurrentView('catalog');
                setSelectedCategoryId(null);
              }}
              className={`hover:text-amber-400 transition-colors whitespace-nowrap ${
                currentView === 'catalog' ? 'text-amber-400 font-extrabold' : ''
              }`}
            >
              Каталог
            </button>
            <button
              onClick={() => setCurrentView('rules')}
              className={`hover:text-amber-400 transition-colors whitespace-nowrap ${
                currentView === 'rules' ? 'text-amber-400 font-extrabold' : ''
              }`}
            >
              Правила сервиса и доставка
            </button>
            <a
              href="https://instagram.com/MSavdo.tj"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 hover:text-amber-400 transition-colors whitespace-nowrap flex items-center gap-1"
            >
              <span>Instagram: @MSavdo.tj</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </nav>

          {/* Корзина заказа */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-black rounded-xl bg-amber-400 text-black hover:bg-amber-300 transition-all shadow-md active:scale-95"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden sm:inline">Корзина</span>
              <span className="bg-black text-amber-400 text-xs font-mono font-extrabold rounded-full px-2 py-0.5 min-w-[20px] text-center">
                {totalCartCount}
              </span>
            </button>
          </div>

        </div>
      </header>

      {/* ======================================================== */}
      {/* 2. ОСНОВНОЙ КОНТЕНТ */}
      {/* ======================================================== */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        
        {/* ЭКРАН 1: ПРАВИЛА СЕРВИСА */}
        {currentView === 'rules' && (
          <RulesView
            onBack={() => setCurrentView('catalog')}
            onOpenCart={() => setIsCartOpen(true)}
          />
        )}

        {/* ЭКРАН 2: АДМИН-ПАНЕЛЬ (ТОЛЬКО ЗДЕСЬ ИМПОРТ И УПРАВЛЕНИЕ) */}
        {currentView === 'admin' && (
          <AdminPanel
            onBack={() => setCurrentView('catalog')}
            onRefreshCatalog={fetchCatalog}
          />
        )}

        {/* ЭКРАН 3: ПУБЛИЧНЫЙ КАТАЛОГ (КОМПАКТНЫЙ, БЫСТРЫЙ, МОБИЛЬНЫЙ) */}
        {currentView === 'catalog' && (
          <div className="space-y-4 sm:space-y-6">
            
            {/* Поисковая строка + Поиск по фото (Камера и галерея) */}
            <div className="space-y-2 max-w-3xl mx-auto">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                    <Search className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Поиск по названию или артикулу (например: кроссовки, худи, MS-849)..."
                    className="w-full pl-10 sm:pl-12 pr-10 py-3 sm:py-3.5 bg-white border border-slate-200 rounded-2xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 shadow-xs transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Кнопка "Поиск по фото" */}
                <button
                  type="button"
                  onClick={() => setIsImageSearchOpen(true)}
                  className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-3 sm:py-3.5 bg-black hover:bg-zinc-800 text-amber-400 border border-amber-400/50 rounded-2xl font-black text-xs sm:text-sm transition-all shadow-xs shrink-0 active:scale-95 group"
                  title="Поиск товара по фото (Камера и галерея)"
                >
                  <Camera className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 group-hover:scale-110 transition-transform" />
                  <span className="hidden sm:inline">Поиск по фото</span>
                </button>
              </div>

              {/* Активный чип поиска по фото, если применен */}
              {searchQuery && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="bg-amber-100 text-amber-900 px-3 py-1 rounded-full font-bold border border-amber-300 flex items-center gap-1.5 shadow-xs">
                    <Sparkles className="w-3 h-3 text-amber-600" />
                    <span>Поиск: &laquo;{searchQuery}&raquo;</span>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="ml-1 hover:text-black font-extrabold"
                    >
                      ×
                    </button>
                  </span>
                </div>
              )}
            </div>

            {/* Быстрые фильтры категорий (горизонтальный свайп на мобильных) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs font-bold select-none py-1">
              <button
                onClick={() => setSelectedCategoryId(null)}
                className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition-all shrink-0 ${
                  selectedCategoryId === null
                    ? 'bg-black text-amber-400 shadow-sm font-black'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                Все категории ({products.length})
              </button>

              {categoriesTree.map((cat) => {
                const isActive = selectedCategoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition-all shrink-0 ${
                      isActive
                        ? 'bg-black text-amber-400 shadow-sm font-black'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>

            {/* Быстрый фильтр типа доставки: Наличие в Душанбе / Под заказ */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold pt-1">
              <button
                onClick={() => setDeliveryFilter('all')}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  deliveryFilter === 'all'
                    ? 'bg-zinc-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                Все товары ({products.length})
              </button>
              <button
                onClick={() => setDeliveryFilter('stock')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  deliveryFilter === 'stock'
                    ? 'bg-emerald-600 text-white shadow-xs font-extrabold'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>🚚 В наличии в Душанбе (1 день)</span>
              </button>
              <button
                onClick={() => setDeliveryFilter('order')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  deliveryFilter === 'order'
                    ? 'bg-amber-400 text-black shadow-xs font-black border border-amber-500'
                    : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span>⏳ Под заказ (15-30 дней)</span>
              </button>
            </div>

            {/* ПАНЕЛЬ СОРТИРОВКИ МАРКЕТПЛЕЙСА (ТРЕБОВАНИЕ 7) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 pb-1 border-b border-slate-200">
              <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <span>Найдено товаров:</span>
                <span className="font-bold text-slate-900 font-mono">{filteredProducts.length}</span>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                <span className="text-[11px] font-bold text-slate-400 shrink-0">Сортировка:</span>
                <div className="inline-flex p-1 bg-slate-200/70 rounded-xl text-xs font-bold gap-1">
                  <button
                    onClick={() => setSortBy('popular')}
                    className={`px-2.5 py-1 rounded-lg transition-all text-[11px] whitespace-nowrap cursor-pointer ${
                      sortBy === 'popular'
                        ? 'bg-black text-amber-400 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🔥 Сначала популярные
                  </button>
                  <button
                    onClick={() => setSortBy('price_asc')}
                    className={`px-2.5 py-1 rounded-lg transition-all text-[11px] whitespace-nowrap cursor-pointer ${
                      sortBy === 'price_asc'
                        ? 'bg-black text-amber-400 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Сначала дешевые
                  </button>
                  <button
                    onClick={() => setSortBy('price_desc')}
                    className={`px-2.5 py-1 rounded-lg transition-all text-[11px] whitespace-nowrap cursor-pointer ${
                      sortBy === 'price_desc'
                        ? 'bg-black text-amber-400 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Сначала дорогие
                  </button>
                  <button
                    onClick={() => setSortBy('newest')}
                    className={`px-2.5 py-1 rounded-lg transition-all text-[11px] whitespace-nowrap cursor-pointer ${
                      sortBy === 'newest'
                        ? 'bg-black text-amber-400 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Сначала новые
                  </button>
                </div>
              </div>
            </div>

            {/* СЕТКА ТОВАРОВ: 2 КОЛОНКИ НА СМАРТФОНАХ (ЧЕТКО И КРАСИВО) */}
            <section>
              {isLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="bg-white rounded-2xl p-3 border border-slate-200 animate-pulse space-y-3">
                      <div className="aspect-square bg-slate-200 rounded-xl" />
                      <div className="h-4 bg-slate-200 rounded w-3/4" />
                      <div className="h-3 bg-slate-100 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-12 text-center space-y-3 shadow-xs max-w-lg mx-auto my-6">
                  <Package className="w-10 h-10 text-amber-500 mx-auto" />
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    Товары не найдены
                  </h3>
                  <p className="text-xs text-slate-400">
                    Попробуйте изменить поисковый запрос или выберите другую категорию.
                  </p>
                  <button
                    onClick={() => {
                      setSelectedCategoryId(null);
                      setSearchQuery('');
                    }}
                    className="mt-2 px-4 py-2 bg-black text-amber-400 rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors"
                  >
                    Показать весь каталог
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                  {filteredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onSelect={(p) => handleOpenProduct(p)}
                      onAddToCart={() => handleOpenProduct(product)}
                    />
                  ))}
                </div>
              )}
            </section>

          </div>
        )}

      </main>

      {/* ======================================================== */}
      {/* 3. МОДАЛЬНЫЕ ОКНА */}
      {/* ======================================================== */}
      
      {/* Карточка товара */}
      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
        onSelectRelatedProduct={handleOpenProduct}
      />

      {/* Корзина */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveFromCart}
        onClearCart={handleClearCart}
        onOpenRules={() => {
          setIsCartOpen(false);
          setCurrentView('rules');
        }}
        whatsappPhone={whatsappPhone}
      />

      {/* Модальное окно поиска по фото (Камера и галерея) */}
      <ImageSearchModal
        isOpen={isImageSearchOpen}
        onClose={() => setIsImageSearchOpen(false)}
        onSelectProduct={(p) => setSelectedProduct(p)}
        onApplySearchQuery={(q) => {
          setSearchQuery(q);
          setSelectedCategoryId(null);
          setCurrentView('catalog');
          addToast('info', 'Поиск по фото', `Показаны товары по запросу: "${q}"`);
        }}
      />

      {/* ======================================================== */}
      {/* 4. МОБИЛЬНАЯ НИЖНЯЯ ПАНЕЛЬ НАВИГАЦИИ (ФИКСИРОВАННАЯ) */}
      {/* ======================================================== */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-black text-white border-t border-zinc-800 px-4 py-2 flex items-center justify-around shadow-2xl">
        <button
          onClick={() => {
            setCurrentView('catalog');
            setSelectedCategoryId(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center gap-1 ${currentView === 'catalog' ? 'text-amber-400' : 'text-zinc-400'}`}
        >
          <Home className="w-4 h-4" />
          <span className="text-[10px] font-bold">Каталог</span>
        </button>

        <button
          onClick={() => setIsImageSearchOpen(true)}
          className="flex flex-col items-center gap-1 text-amber-400 font-bold"
          title="Поиск по фото"
        >
          <Camera className="w-4 h-4" />
          <span className="text-[10px] font-bold">По фото</span>
        </button>

        <button
          onClick={() => {
            setCurrentView('catalog');
            searchInputRef.current?.focus();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex flex-col items-center gap-1 text-zinc-400"
        >
          <Search className="w-4 h-4" />
          <span className="text-[10px] font-bold">Поиск</span>
        </button>

        <a
          href={`https://wa.me/${whatsappPhone.replace(/[^0-9]/g, '')}`}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col items-center gap-1 text-emerald-400"
        >
          <MessageCircle className="w-4 h-4" />
          <span className="text-[10px] font-bold">WhatsApp</span>
        </a>

        <button
          onClick={() => setIsCartOpen(true)}
          className="relative flex flex-col items-center gap-1 text-amber-400 font-bold"
        >
          <div className="relative">
            <ShoppingBag className="w-4 h-4" />
            {totalCartCount > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-amber-400 text-black text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                {totalCartCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold">Корзина</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* 5. ФУТЕР (ПРЕМИАЛЬНЫЙ ЖЕЛТО-ЧЕРНЫЙ БРЕНДИНГ + СКРЫТЫЙ СЛУЖЕБНЫЙ ВХОД) */}
      {/* ======================================================== */}
      <footer className="bg-black text-white border-t border-zinc-800 mt-16 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-400">
          
          <div className="flex items-center gap-3">
            <img 
              src={BRAND_LOGO_URL} 
              alt="M.Savdo" 
              className="w-7 h-7 rounded-lg object-cover border border-amber-400"
            />
            <div>
              <span className="font-black text-white">MSavdo</span> · Сервис выкупа фабричных товаров
              <span className="text-zinc-600 block sm:inline sm:ml-2">Instagram: <strong className="text-amber-400">@MSavdo.tj</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <button 
              onClick={() => setCurrentView('rules')} 
              className="hover:text-amber-400 transition-colors"
            >
              Правила сервиса
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

        </div>
      </footer>

    </div>
  );
}
