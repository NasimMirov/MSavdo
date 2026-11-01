import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Product, ProductVariant, CartItem } from '../types';
import { X, Check, ShoppingBag, ShieldCheck, Truck, Sparkles, Clock, Loader2 } from 'lucide-react';
import { apiFetch } from '../api';

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
  const [relatedAiLoading, setRelatedAiLoading] = useState(false);
  const [relatedAiError, setRelatedAiError] = useState('');
  const [relatedFoundByAi, setRelatedFoundByAi] = useState(false);
  const relatedAiController = useRef<AbortController | null>(null);

  useEffect(() => {
    relatedAiController.current?.abort();
    relatedAiController.current = null;
    setRelatedAiLoading(false);
    setRelatedAiError('');
    setRelatedFoundByAi(false);
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

    return () => {
      controller.abort();
      relatedAiController.current?.abort();
    };
  }, [product?.id]);

  const findSimilarWithAi = async () => {
    if (!product) return;
    relatedAiController.current?.abort();
    const controller = new AbortController();
    relatedAiController.current = controller;
    setRelatedAiLoading(true);
    setRelatedAiError('');
    try {
      const response = await apiFetch(`/api/products/${product.id}/ai-related`, {
        method: 'POST',
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось найти похожие товары');
      setRelatedProducts(Array.isArray(data.products) ? data.products : []);
      setRelatedFoundByAi(true);
      document.getElementById('related-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        setRelatedAiError(error.message || 'Не удалось найти похожие товары');
      }
    } finally {
      if (relatedAiController.current === controller) {
        relatedAiController.current = null;
        setRelatedAiLoading(false);
      }
    }
  };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-fade-in">
      <div 
        className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200/80 relative flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Кнопка закрытия */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 z-20 p-2 text-slate-400 hover:text-slate-800 bg-white/90 hover:bg-slate-100 rounded-full transition-colors shadow-xs"
          aria-label="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-4 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10">
          
          {/* Левая колонка: Галерея, видео и изображения */}
          <div className="space-y-3.5">
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
                  📷 Фото ({allGalleryImages.length})
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
                  <span>Видеообзор товара</span>
                </button>
              </div>
            )}

            {/* Главный блок показа */}
            <div className="aspect-[4/4.5] bg-slate-100 rounded-2xl overflow-hidden border border-slate-200/80 relative shadow-sm">
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

              <div className="absolute top-3.5 left-3.5 bg-slate-900/85 backdrop-blur-md text-white text-[11px] font-mono font-bold px-3 py-1 rounded-full shadow-xs">
                {activeVariant?.variant_sku || product.base_sku}
              </div>

              {product.delivery_type === 'stock' ? (
                <div className="absolute bottom-3.5 left-3.5 bg-emerald-700/90 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-xs flex items-center gap-1.5 border border-emerald-400/40">
                  <Truck className="w-3.5 h-3.5 text-white" />
                  <span>В наличии · доставка 1 день</span>
                </div>
              ) : (
                <div className="absolute bottom-3.5 left-3.5 bg-[#f4c542]/95 text-slate-900 text-[10px] font-bold px-3 py-1 rounded-full shadow-xs flex items-center gap-1.5 border border-black/5">
                  <Clock className="w-3.5 h-3.5" />
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
                      className={`relative w-14 h-14 rounded-xl overflow-hidden border-2 shrink-0 transition-all ${
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

            <div className="grid grid-cols-2 gap-3 text-xs text-slate-500 pt-1">
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
          <div className="flex flex-col justify-between space-y-6">
            <div>
              {/* Категория и коллекция */}
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                <div className="flex items-center gap-2 truncate">
                  <span>{product.category_name || 'Каталог'}</span>
                  <span aria-hidden="true">·</span>
                  <span>Оригинальная коллекция</span>
                </div>
                {(product.views_count || 0) > 0 && (
                  <div className="text-[11px] font-mono font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                    <span>👁</span>
                    <span>{product.views_count} просмотров</span>
                  </div>
                )}
              </div>

              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug font-heading">
                {product.title}
              </h1>
              <button
                type="button"
                onClick={findSimilarWithAi}
                disabled={relatedAiLoading || relatedLoading}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-[#f4c542] disabled:cursor-wait disabled:opacity-70"
              >
                {relatedAiLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Sparkles className="h-3.5 w-3.5" />}
                {relatedAiLoading ? 'Ищем похожие…' : 'Найти похожие'}
              </button>

              {/* Блок цены за выбранный вариант */}
              <div className="mt-4 p-4 sm:p-5 bg-gradient-to-br from-slate-50 to-slate-100/70 border border-slate-200/90 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-medium">Финальная стоимость:</div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono mt-0.5">
                    {currentPriceTjs} <span className="text-base font-bold text-slate-600">TJS</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 font-medium">Срок поставки:</div>
                  {product.delivery_type === 'stock' ? (
                    <div className="text-xs sm:text-sm font-bold text-slate-800 mt-0.5 flex items-center gap-1.5 justify-end">
                      <Truck className="w-4 h-4 shrink-0" />
                      <span className="max-w-[72%] whitespace-normal break-words text-right leading-tight">В наличии · 1 день</span>
                    </div>
                  ) : (
                    <div className="text-xs sm:text-sm font-bold text-slate-800 mt-0.5 flex items-center gap-1.5 justify-end">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span className="max-w-[72%] whitespace-normal break-words text-right leading-tight">Доставка 18–30 дней</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Авторитетный инфо-блок доставки */}
              {product.delivery_type === 'stock' ? (
                <div className="mt-3 p-3 bg-[#fff7db] border border-[#ecd17c] rounded-2xl flex items-center gap-2.5 text-xs text-slate-800 shadow-xs">
                  <Truck className="w-4 h-4 shrink-0" />
                  <span><strong>В наличии · доставка 1 день</strong> — на складе в Душанбе</span>
                </div>
              ) : (
                <div className="mt-3 p-3 bg-[#fff7db] border border-[#ecd17c] rounded-2xl flex items-center gap-2.5 text-xs text-slate-800 shadow-xs">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span><strong>Доставка 18–30 дней</strong></span>
                </div>
              )}

              {/* 1. КОНФИГУРАТОР ЦВЕТА (Круглые иконки / плашки) */}
              {availableColors.length > 0 && availableColors[0].name !== 'Стандарт' && (
                <div className="mt-6 space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-900">
                      Цвет: <span className="font-medium text-emerald-800">{selectedColor}</span>
                    </span>
                    <span className="text-slate-400 text-[11px]">{availableColors.length} вар.</span>
                  </div>

                  <div className="flex flex-wrap gap-2.5">
                    {availableColors.map((col) => {
                      const isSelected = selectedColor === col.name;
                      return (
                        <button
                          key={col.name}
                          type="button"
                          onClick={() => setSelectedColor(col.name)}
                          className={`group relative flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
                            isSelected
                              ? 'bg-slate-900 text-white ring-2 ring-emerald-600 shadow-sm'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          {col.img ? (
                            <img
                              src={col.img}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-5 h-5 rounded-full object-cover border border-white/40"
                            />
                          ) : (
                            <span className="w-4 h-4 rounded-full bg-gradient-to-tr from-slate-700 to-slate-400 border border-white/50" />
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
                <div className="mt-5 space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-900">
                      Размер: <span className="font-medium text-emerald-800">{selectedSize}</span>
                    </span>
                    <span className="text-slate-400 text-[11px]">Таблица размеров</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {availableSizesForColor.map((size) => {
                      const isSelected = selectedSize === size;
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setSelectedSize(size)}
                          className={`min-w-12 h-11 px-3.5 flex items-center justify-center rounded-xl text-xs font-bold font-mono transition-all duration-150 ${
                            isSelected
                              ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-600 ring-offset-1'
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
              <div className="mt-6 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 font-heading">
                    Описание
                  </h4>
                </div>
                <div className="bg-gradient-to-br from-amber-50/40 via-slate-50 to-emerald-50/20 p-4 rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="text-xs sm:text-sm text-slate-700 leading-relaxed font-normal whitespace-pre-line">
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
                Заказать · {currentPriceTjs} TJS
              </button>
              <button
                type="button"
                onClick={handleAddToCart}
                aria-label="Добавить товар в корзину"
                title="Добавить в корзину"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 transition hover:bg-slate-50"
              >
                {added ? <Check className="h-5 w-5" /> : <ShoppingBag className="h-5 w-5" />}
              </button>
              </div>

              <div className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1">
                <span>Артикул модификации:</span>
                <span className="font-mono font-semibold text-slate-600">{activeVariant?.variant_sku}</span>
              </div>
            </div>

            <section id="related-products" className="scroll-mt-24 px-4 pb-8 sm:px-8" aria-label="Похожие товары">
              <div className="mb-4 flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                  {relatedFoundByAi ? 'Похожие товары по характеристикам' : 'Рекомендуем вам'}
                </h3>
              </div>
              {relatedAiError && (
                <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {relatedAiError}
                </p>
              )}

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
                              <div className="flex h-full items-center justify-center text-xs text-slate-400">Нет фото</div>
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
                                  ? 'В наличии · 1 день'
                                  : 'Доставка 18–30 дней'}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
              </div>
              {!relatedLoading && relatedProducts.length === 0 && (
                <p className="text-xs text-slate-500">
                  Похожие товары пока не найдены.
                </p>
              )}
            </section>

          </div>
        </div>

      </div>
    </div>
  );
};
