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
  Shirt,
  Smartphone,
  Footprints,
  Watch,
  Sofa,
  Baby,
  Dumbbell,
  Headphones
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const BRAND_LOGO_URL = '/msavdo-logo.jpg';

function getCategoryIcon(name: string): LucideIcon {
  const category = name.toLocaleLowerCase('ru');
  if (/обув|кроссов|сандал|ботин|тапоч/.test(category)) return Footprints;
  if (/одеж|одежд|футбол|худи|куртк|плать|брюк/.test(category)) return Shirt;
  if (/телефон|электрон|гаджет|компьют|планшет/.test(category)) return Smartphone;
  if (/час|украш|аксессуар|сумк/.test(category)) return Watch;
  if (/дом|мебел|кухн|интерьер/.test(category)) return Sofa;
  if (/дет|ребен|игруш|малыш/.test(category)) return Baby;
  if (/спорт|фитнес|тренир/.test(category)) return Dumbbell;
  if (/науш|аудио|звук/.test(category)) return Headphones;
  return Package;
}

export default function App() {
  const [currentView, setCurrentView] = useState<'catalog' | 'rules' | 'admin'>('catalog');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

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
      <header className="sticky top-0 z-40 bg-[#f4c542] text-slate-950 border-b border-[#deb02b] shadow-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-[76px] flex items-center gap-3 sm:gap-6">
          
          <div 
            onClick={() => {
              setCurrentView('catalog');
              setSelectedCategoryId(null);
              setSearchQuery('');
            }}
            className="cursor-pointer flex items-center gap-2 sm:gap-3 shrink-0 select-none group"
          >
            <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl overflow-hidden border border-black/10 shadow-md shrink-0 bg-[#f4c542] flex items-center justify-center">
              <img 
                src={BRAND_LOGO_URL} 
                alt="MSavdo" 
                className="w-full h-full object-contain group-hover:scale-105 transition-transform"
              />
            </div>
            <span className="text-lg sm:text-2xl font-black tracking-tight text-slate-950 font-heading">MSavdo</span>
          </div>

          {currentView === 'catalog' && (
            <div className="relative min-w-0 flex-1 max-w-3xl ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Поиск товаров"
                aria-label="Поиск товаров"
                className="w-full h-10 sm:h-11 rounded-xl border border-black/10 bg-white/95 pl-9 pr-9 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:ring-2 focus:ring-slate-900/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Очистить поиск"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
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
            
            {/* Быстрые фильтры категорий (горизонтальный свайп на мобильных) */}
            <div className="flex items-start gap-3 overflow-x-auto pb-2 scrollbar-none select-none snap-x">
              <button
                onClick={() => setSelectedCategoryId(null)}
                className="flex w-[68px] shrink-0 snap-start flex-col items-center gap-1.5 text-center"
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fff1b8] to-[#e9ba2e] text-slate-900 shadow-[0_4px_0_#c79a18,0_7px_12px_rgba(15,23,42,0.12)] ring-1 ring-black/5 transition-transform ${selectedCategoryId === null ? '-translate-y-0.5 ring-2 ring-slate-900/30' : ''}`}>
                  <Package className="h-6 w-6 drop-shadow-sm" strokeWidth={2.2} />
                </span>
                <span className="w-full truncate text-[10px] font-bold text-slate-700">Все</span>
              </button>

              {categoriesTree.map((cat) => {
                const isActive = selectedCategoryId === cat.id;
                const CategoryIcon = getCategoryIcon(cat.name);
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className="flex w-[68px] shrink-0 snap-start flex-col items-center gap-1.5 text-center"
                  >
                    <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-white to-slate-200 text-slate-800 shadow-[0_4px_0_#cbd5e1,0_7px_12px_rgba(15,23,42,0.12)] ring-1 ring-slate-300 transition-transform ${isActive ? '-translate-y-0.5 ring-2 ring-amber-500' : ''}`}>
                      <CategoryIcon className="h-6 w-6 drop-shadow-sm" strokeWidth={2.2} />
                    </span>
                    <span className="w-full truncate text-[10px] font-bold text-slate-700">{cat.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Компактный единый фильтр доставки */}
            <div className="flex max-w-full items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-[10px] sm:text-xs font-semibold">
              <button
                onClick={() => setDeliveryFilter('all')}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 transition-colors ${deliveryFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                Все товары
              </button>
              <button
                onClick={() => setDeliveryFilter('order')}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 transition-colors ${deliveryFilter === 'order' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                Доставка 18–30 дней
              </button>
              <button
                onClick={() => setDeliveryFilter('stock')}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 transition-colors ${deliveryFilter === 'stock' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                В наличии · 1 день
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
        onOrderNow={(item) => {
          handleAddToCart(item);
          setSelectedProduct(null);
          setIsCartOpen(true);
        }}
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

      {/* ======================================================== */}
      {/* 4. МОБИЛЬНАЯ НИЖНЯЯ ПАНЕЛЬ НАВИГАЦИИ (ФИКСИРОВАННАЯ) */}
      {/* ======================================================== */}
      {currentView === 'catalog' && (
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          aria-label={`Открыть корзину, товаров: ${totalCartCount}`}
          className="fixed bottom-6 right-6 z-40 hidden h-12 w-12 items-center justify-center rounded-full bg-[#f4c542] text-slate-950 shadow-xl ring-1 ring-black/10 transition hover:scale-105 active:scale-95 md:flex"
        >
          <ShoppingBag className="h-5 w-5" />
          {totalCartCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-bold text-white">
              {totalCartCount}
            </span>
          )}
        </button>
      )}
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
