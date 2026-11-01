import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Product, ProductVariant, CartItem } from '../types';
import { X, Check, ShoppingBasket, ShieldCheck, Truck, Sparkles, Clock } from 'lucide-react';
import { apiFetch } from '../api';
import { useI18n } from '../i18n';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
  onOrderNow: (item: CartItem) => void;
  onSelectRelatedProduct: (product: Product) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onAddToCart,
  onOrderNow,
  onSelectRelatedProduct,
}) => {
  const { t } = useI18n();
  const variants = product?.variants || [];

  // Уникальные цвета и размеры
  const availableColors = useMemo(() => {
    const map = new Map<string, { name: string; img?: string }>();
    variants.forEach((v) => {
      if (v.color && !map.has(v.color)) {
        map.set(v.color, { name: v.color, img: v.image_url });
      }
    });
    return Array.from(map.values());
  }, [variants]);

  // Выбранный цвет
  const [selectedColor, setSelectedColor] = useState<string>(
    availableColors[0]?.name || variants[0]?.color || 'Стандарт'
  );

  // Доступные размеры для выбранного цвета
  const availableSizesForColor = useMemo(() => {
    const list: string[] = [];
    variants.forEach((v) => {
      if (v.color === selectedColor && v.size && !list.includes(v.size)) {
        list.push(v.size);
      }
    });
    // Если для цвета нет специфических, берем все уникальные
    if (list.length === 0) {
      variants.forEach((v) => {
        if (v.size && !list.includes(v.size)) list.push(v.size);
      });
    }
    return list;
  }, [variants, selectedColor]);

  // Выбранный размер
  const [selectedSize, setSelectedSize] = useState<string>(
    availableSizesForColor[0] || 'One Size'
  );

  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  useEffect(() => {
    if (!product) {
      setRelatedProducts([]);
      setRelatedLoading(false);
      return;
    }

    const controller = new AbortController();
    setRelatedLoading(true);
    setRelatedProducts([]);
    apiFetch(`/api/products/${product.id}/related`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Не удалось загрузить похожие товары (${response.status})`);
        return response.json();
      })
      .then((data) => {
        setRelatedProducts(Array.isArray(data.products) ? data.products : []);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('[Related Products]', error);
          setRelatedProducts([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setRelatedLoading(false);
      });

    return () => controller.abort();
  }, [product?.id]);

  // Синхронизация размера при смене цвета
  useEffect(() => {
    if (availableSizesForColor.length > 0 && !availableSizesForColor.includes(selectedSize)) {
      setSelectedSize(availableSizesForColor[0]);
    }
  }, [selectedColor, availableSizesForColor, selectedSize]);

  // Поиск активного варианта по комбинации (Цвет + Размер)
  const activeVariant: ProductVariant | undefined = useMemo(() => {
    return (
      variants.find((v) => v.color === selectedColor && v.size === selectedSize) ||
      variants.find((v) => v.color === selectedColor) ||
      variants[0]
    );
  }, [variants, selectedColor, selectedSize]);

  // Текущая цена в сомони
  const currentPriceTjs = activeVariant ? activeVariant.price_tjs : (product?.min_price_tjs || 0);

  // Список всех фото товара
  const allGalleryImages = useMemo(() => {
    const list: string[] = [];
    if (product?.images) {
      product.images.split(',').forEach((s) => {
        const t = s.trim();
        if (t && !list.includes(t)) list.push(t);
      });
    }
    if (product?.main_image && !list.includes(product.main_image)) {
      list.unshift(product.main_image);
    }
    variants.forEach((v) => {
      if (v.image_url && !list.includes(v.image_url)) list.push(v.image_url);
    });
    return list;
  }, [product, variants]);

  // Выбранное фото из галереи и режим медиа
  const [selectedGalleryImage, setSelectedGalleryImage] = useState<string>(product?.main_image || '');
  const [mediaMode, setMediaMode] = useState<'photo' | 'video'>('photo');
  const galleryTouchStart = useRef<{ x: number; y: number } | null>(null);
  const edgeSwipeStart = useRef<{ x: number; y: number } | null>(null);

  const moveGallery = (direction: -1 | 1) => {
    if (allGalleryImages.length < 2) return;
    const currentIndex = allGalleryImages.indexOf(currentImage);
    const nextIndex = (Math.max(currentIndex, 0) + direction + allGalleryImages.length) % allGalleryImages.length;
    setSelectedGalleryImage(allGalleryImages[nextIndex]);
    setMediaMode('photo');
  };

  useEffect(() => {
    if (activeVariant?.image_url) {
      setSelectedGalleryImage(activeVariant.image_url);
      setMediaMode('photo');
    }
  }, [activeVariant]);

  // Текущее изображение
  const currentImage = selectedGalleryImage || activeVariant?.image_url || product?.main_image || '';

  // Характеристики товара (спецификации)
  const productSpecs = useMemo(() => {
    if (!product?.specifications) return [];
    if (Array.isArray(product.specifications)) return product.specifications;
    if (typeof product.specifications === 'string') {
      try {
        const parsed = JSON.parse(product.specifications);
        if (Array.isArray(parsed)) return parsed;
        if (typeof parsed === 'object' && parsed !== null) {
          return Object.entries(parsed).map(([name, value]) => ({ name, value: String(value) }));
        }
      } catch (_) {
        return product.specifications.split('\n').filter(Boolean).map((line) => {
          const [name, ...rest] = line.split(/[:：]/);
          return { name: (name || '').trim(), value: rest.join(':').trim() || '' };
        }).filter((item) => item.name && item.value);
      }
    }
    return [];
  }, [product?.specifications]);

  // Статус добавления
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!product) return;
    setSelectedColor(availableColors[0]?.name || variants[0]?.color || 'Стандарт');
    setSelectedGalleryImage(product.main_image || '');
    setMediaMode('photo');
    setAdded(false);
  }, [product?.id]);

  if (!product) return null;

  const createCartItem = (): CartItem | null => {
    if (!activeVariant) return null;

    return {
      id: `${product.id}_${activeVariant.variant_sku}`,
      product_id: product.id,
      variant_id: activeVariant.id,
      base_sku: product.base_sku,
      variant_sku: activeVariant.variant_sku,
      title: product.title,
      color: activeVariant.color || 'Стандарт',
      size: activeVariant.size || 'One Size',
      price_tjs: activeVariant.price_tjs,
      image: activeVariant.image_url || product.main_image,
      quantity: 1,
      stock: activeVariant.stock,
      delivery_type: product.delivery_type || 'order',
    };
  };

  const handleAddToCart = () => {
    const cartItem = createCartItem();
    if (!cartItem) return;
    onAddToCart(cartItem);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleOrderNow = () => {
    const cartItem = createCartItem();
    if (cartItem) onOrderNow(cartItem);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-4 bg-slate-900/70 backdrop-blur-md animate-fade-in">
      <div 
      className="bg-white rounded-2xl sm:rounded-3xl max-w-4xl w-full max-h-[98dvh] sm:max-h-[92vh] overflow-y-auto overscroll-contain shadow-2xl border border-slate-200/80 relative flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          edgeSwipeStart.current = touch.clientX <= 24 ? { x: touch.clientX, y: touch.clientY } : null;
        }}
        onTouchEnd={(event) => {
          const start = edgeSwipeStart.current;
          edgeSwipeStart.current = null;
          if (!start) return;
          const touch = event.changedTouches[0];
          const deltaX = touch.clientX - start.x;
          const deltaY = touch.clientY - start.y;
          if (deltaX > 80 && deltaX > Math.abs(deltaY)) onClose();
        }}
      >
        <div className="sticky top-0 z-30 -mb-10 flex h-10 shrink-0 justify-end p-1.5 pointer-events-none">
          <button
            onClick={onClose}
            className="pointer-events-auto rounded-full bg-white/95 p-2 text-slate-500 shadow-md transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label={t('close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6 lg:gap-10">
          
          {/* Левая колонка: Галерея, видео и изображения */}
          <div className="space-y-2 sm:space-y-3.5">
            {/* Переключатель Фото / Видео если есть видео */}
            {(product.youtube_url || product.video_url) && (
              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => setMediaMode('photo')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    mediaMode === 'photo'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  📷 {t('photo')} ({allGalleryImages.length})
                </button>
                <button
                  onClick={() => setMediaMode('video')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                    mediaMode === 'video'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                >
                  <span>▶</span>
                  <span>{t('videoReview')}</span>
                </button>
              </div>
            )}

            {/* Главный блок показа */}
            <div
              className="relative h-[32dvh] min-h-44 max-h-[280px] touch-pan-y overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100 shadow-sm sm:aspect-[4/4.5] sm:h-auto sm:max-h-none sm:rounded-2xl"
              onTouchStart={(event) => {
                const touch = event.touches[0];
                galleryTouchStart.current = { x: touch.clientX, y: touch.clientY };
              }}
              onTouchEnd={(event) => {
                const start = galleryTouchStart.current;
                galleryTouchStart.current = null;
                if (!start || mediaMode !== 'photo' || edgeSwipeStart.current) return;
                const touch = event.changedTouches[0];
                const deltaX = touch.clientX - start.x;
                const deltaY = touch.clientY - start.y;
                if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
                  moveGallery(deltaX < 0 ? 1 : -1);
                }
              }}
            >
              {mediaMode === 'video' && (product.youtube_url || product.video_url) ? (
                (() => {
                  const targetVideo = (product.youtube_url || product.video_url || '').trim();
                  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/;
                  const match = targetVideo.match(regExp);
                  if (match && match[1]) {
                    return (
                      <iframe
                        src={`https://www.youtube.com/embed/${match[1]}?autoplay=1&mute=0`}
                        title={product.title}
                        className="w-full h-full rounded-2xl border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    );
                  }
                  return (
                    <video
                      src={targetVideo}
                      controls
                      autoPlay
                      playsInline
                      poster={currentImage}
                      className="w-full h-full object-cover"
                    />
                  );
                })()
              ) : (
                <img
                  src={currentImage}
                  alt={product.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-all duration-300"
                />
              )}

              <div className="absolute top-2 left-2 bg-slate-900/75 text-white text-[9px] font-mono font-bold px-2 py-0.5 rounded-md shadow-xs">
                {activeVariant?.variant_sku || product.base_sku}
              </div>

              {product.delivery_type === 'stock' ? (
                <div className="absolute bottom-2 left-2 bg-[#f4c542]/95 text-slate-900 text-[9px] font-bold px-2 py-1 rounded-md shadow-xs flex items-center gap-1">
                  <Truck className="w-3 h-3" />
                  <span>В наличии · доставка 1 день</span>
                </div>
              ) : (
                <div className="absolute bottom-2 left-2 bg-[#f4c542]/95 text-slate-900 text-[9px] font-bold px-2 py-1 rounded-md shadow-xs flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Доставка 18–30 дней</span>
                </div>
              )}
            </div>

            {/* Миниатюры галереи нескольких фото */}
            {allGalleryImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {allGalleryImages.map((img, idx) => {
                  const isSelected = mediaMode === 'photo' && currentImage === img;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedGalleryImage(img);
                        setMediaMode('photo');
                      }}
                      className={`relative w-11 h-11 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl overflow-hidden border-2 shrink-0 transition-all ${
                        isSelected
                          ? 'border-emerald-600 ring-2 ring-emerald-500/30 scale-105'
                          : 'border-slate-200 hover:border-slate-400 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={img}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            )}

            <div className="hidden sm:grid grid-cols-2 gap-3 text-xs text-slate-500 pt-1">
              <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Фиксированная бережная доставка</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Гарантия возврата на карту</span>
              </div>
            </div>
          </div>

          {/* Правая колонка: Конфигуратор товара */}
          <div className="flex flex-col justify-between space-y-3 sm:space-y-6">
            <div>
              {/* Категория и коллекция */}
              <div className="flex items-center justify-between text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 sm:mb-2">
                <div className="flex items-center gap-2 truncate">
                  <span>{product.category_name || t('catalog')}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t('originalCollection')}</span>
                </div>
              </div>

              <h1 className="text-base sm:text-2xl font-bold text-slate-900 leading-snug font-heading">
                {product.title}
              </h1>

              {/* Блок цены за выбранный вариант */}
              <div className="mt-1.5 sm:mt-4 p-2.5 sm:p-5 bg-gradient-to-br from-slate-50 to-slate-100/70 border border-slate-200/90 rounded-xl sm:rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-[10px] sm:text-xs text-slate-500 font-medium">{t('finalPrice')}</div>
                  <div className="text-lg sm:text-3xl font-extrabold text-slate-900 font-mono mt-0.5">
                    {currentPriceTjs} <span className="text-sm sm:text-base font-bold text-slate-600">TJS</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] sm:text-xs text-slate-500 font-medium">{t('deliveryTime')}</div>
                  {product.delivery_type === 'stock' ? (
                    <div className="text-xs sm:text-sm font-bold text-slate-800 mt-0.5 flex items-center gap-1.5 justify-end">
                      <Truck className="w-4 h-4 shrink-0" />
                      <span className="max-w-[72%] whitespace-normal break-words text-right leading-tight">{t('inStock')}</span>
                    </div>
                  ) : (
                    <div className="text-xs sm:text-sm font-bold text-slate-800 mt-0.5 flex items-center gap-1.5 justify-end">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span className="max-w-[72%] whitespace-normal break-words text-right leading-tight">{t('delivery18to30')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Авторитетный инфо-блок доставки */}
              {product.delivery_type === 'stock' ? (
                <div className="hidden md:flex mt-3 p-3 bg-[#fff7db] border border-[#ecd17c] rounded-2xl items-center gap-2.5 text-xs text-slate-800 shadow-xs">
                  <Truck className="w-4 h-4 shrink-0" />
                  <span><strong>В наличии · доставка 1 день</strong> — на складе в Душанбе</span>
                </div>
              ) : (
                <div className="hidden md:flex mt-3 p-3 bg-[#fff7db] border border-[#ecd17c] rounded-2xl items-center gap-2.5 text-xs text-slate-800 shadow-xs">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span><strong>Доставка 18–30 дней</strong></span>
                </div>
              )}

              {/* 1. КОНФИГУРАТОР ЦВЕТА (Круглые иконки / плашки) */}
              {availableColors.length > 0 && availableColors[0].name !== 'Стандарт' && (
                <div className="mt-3 sm:mt-6 space-y-1.5 sm:space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-900">
                      {t('selectedColor')} <span className="font-medium text-emerald-800">{selectedColor}</span>
                    </span>
                    <span className="text-slate-400 text-[11px]">{availableColors.length} вар.</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 sm:gap-2.5">
                    {availableColors.map((col) => {
                      const isSelected = selectedColor === col.name;
                      return (
                        <button
                          key={col.name}
                          type="button"
                          onClick={() => setSelectedColor(col.name)}
                          className={`group relative flex items-center gap-1.5 sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-semibold transition-all duration-150 ${
                            isSelected
                              ? 'bg-slate-900 text-white ring-1 ring-emerald-600 shadow-sm'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          {col.img ? (
                            <img
                              src={col.img}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg object-cover border border-white/60 shadow-sm"
                            />
                          ) : (
                            <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-tr from-slate-700 to-slate-400 border border-white/50" />
                          )}
                          <span>{col.name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 ml-0.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. КОНФИГУРАТОР РАЗМЕРА (Плитки) */}
              {availableSizesForColor.length > 0 && availableSizesForColor[0] !== 'One Size' && (
                <div className="mt-3 sm:mt-5 space-y-1.5 sm:space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-900">
                      {t('selectedSize')} <span className="font-medium text-emerald-800">{selectedSize}</span>
                    </span>
                    <span className="text-slate-400 text-[11px]">Таблица размеров</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {availableSizesForColor.map((size) => {
                      const isSelected = selectedSize === size;
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setSelectedSize(size)}
                          className={`min-w-9 h-8 sm:min-w-12 sm:h-11 px-2 sm:px-3.5 flex items-center justify-center rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold font-mono transition-all duration-150 ${
                            isSelected
                              ? 'bg-emerald-600 text-white shadow-md ring-1 ring-emerald-600 ring-offset-1'
                              : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                          }`}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Описание товара (Требование 8) */}
              <div className="mt-3 sm:mt-6 pt-3 sm:pt-4 border-t border-slate-100">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 font-heading">
                    {t('description')}
                  </h4>
                </div>
                <div className="bg-gradient-to-br from-amber-50/40 via-slate-50 to-emerald-50/20 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="text-[11px] sm:text-sm text-slate-700 leading-relaxed font-normal whitespace-pre-line">
                    {product.description || 'Качественные фабричные материалы, продуманная эргономика и надежность в повседневном использовании.'}
                  </div>
                </div>
              </div>
            </div>

            {/* Кнопка добавления в корзину */}
            <div className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t border-slate-200/80 bg-white/95 px-4 pb-2 pt-3 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:p-0">
              <div className="flex items-center gap-2">
              <button
                onClick={handleOrderNow}
                className="flex-1 rounded-xl bg-[#f4c542] px-4 py-3.5 text-sm font-bold tracking-wide text-slate-950 shadow-sm transition hover:bg-[#eabd32] active:scale-[0.98]"
              >
                {t('orderNow')} · {currentPriceTjs} TJS
              </button>
              <button
                type="button"
                onClick={handleAddToCart}
                aria-label={t('addToCart')}
                title={t('addToCart')}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 transition hover:bg-slate-50"
              >
                {added ? <Check className="h-5 w-5" /> : <ShoppingBasket className="h-5 w-5" />}
              </button>
              </div>

              <div className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1">
                <span>{t('modificationSku')}</span>
                <span className="font-mono font-semibold text-slate-600">{activeVariant?.variant_sku}</span>
              </div>
            </div>

            <section id="related-products" className="scroll-mt-24 px-4 pb-8 sm:px-8" aria-label={t('similarProducts')}>
              <div className="mb-3 sm:mb-4 flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                  {t('recommendations')}
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {relatedLoading
                  ? Array.from({ length: 4 }, (_, index) => (
                      <div key={`related-skeleton-${index}`} className="animate-pulse overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="aspect-square bg-slate-200" />
                        <div className="space-y-2 p-3">
                          <div className="h-3 w-4/5 rounded bg-slate-200" />
                          <div className="h-3 w-2/5 rounded bg-slate-200" />
                          <div className="h-5 w-1/2 rounded bg-slate-200" />
                        </div>
                      </div>
                    ))
                  : relatedProducts.map((related) => {
                      const image = related.main_image
                        || related.images?.split(',')[0]?.trim()
                        || related.variants?.[0]?.image_url
                        || '';
                      return (
                        <button
                          key={related.id}
                          type="button"
                          onClick={() => onSelectRelatedProduct(related)}
                          className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                        >
                          <div className="aspect-square overflow-hidden bg-slate-100">
                            {image ? (
                              <img
                                src={image}
                                alt={related.title}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs text-slate-400">{t('noPhoto')}</div>
                            )}
                          </div>
                          <div className="space-y-2 p-3">
                            <p className="line-clamp-2 min-h-9 text-xs font-semibold leading-4 text-slate-800">
                              {related.title}
                            </p>
                            <div className="flex min-h-10 items-center justify-between gap-1">
                              <span className="text-sm font-extrabold text-emerald-700">
                                {Number(related.min_price_tjs || 0).toLocaleString('ru-RU')} TJS
                              </span>
                              <span className={`min-w-0 max-w-[65%] whitespace-normal break-words rounded-full px-2 py-1 text-right text-[9px] font-bold leading-tight ${
                                related.delivery_type === 'stock'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {related.delivery_type === 'stock'
                                  ? t('inStock')
                                  : t('delivery18to30')}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
              </div>
              {!relatedLoading && relatedProducts.length === 0 && (
                <p className="text-xs text-slate-500">
                  {t('similarNotFound')}
                </p>
              )}
            </section>

          </div>
        </div>

      </div>
    </div>
  );
};
