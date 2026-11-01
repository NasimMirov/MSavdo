import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Product, ProductVariant, CartItem } from '../types';
import { X, Check, ShoppingBasket, ShieldCheck, Truck, Sparkles, Clock, Minus, Plus, ZoomIn, Play } from 'lucide-react';
import { apiFetch } from '../api';
import { useI18n } from '../i18n';
import { ProductShareButton } from './ProductShareButton';

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
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [isQuantityPickerOpen, setIsQuantityPickerOpen] = useState(false);
  const [isPhotoZoomed, setIsPhotoZoomed] = useState(false);
  const [photoAspectRatio, setPhotoAspectRatio] = useState(1);

  const productVideos = useMemo(() => {
    const storedVideos = Array.isArray(product?.video_urls) ? product.video_urls : [];
    return [...new Set([
      ...storedVideos,
      product?.youtube_url || '',
      product?.video_url || '',
    ].map((video) => video.trim()).filter(Boolean))];
  }, [product]);

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

  const mediaSlides = useMemo(
    () => [
      ...allGalleryImages.map((src) => ({ type: 'photo' as const, src })),
      ...productVideos.map((src) => ({ type: 'video' as const, src })),
    ],
    [allGalleryImages, productVideos]
  );
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const galleryTouchStart = useRef<{ x: number; y: number } | null>(null);
  const zoomTouchStart = useRef<{ x: number; y: number } | null>(null);
  const edgeSwipeStart = useRef<{ x: number; y: number } | null>(null);

  const openPhotoZoom = () => {
    if (!window.history.state?.msavdoPhotoZoom) {
      const currentState = window.history.state;
      window.history.pushState(
        { ...(typeof currentState === 'object' && currentState !== null ? currentState : {}), msavdoPhotoZoom: true },
        '',
        window.location.href,
      );
    }
    setIsPhotoZoomed(true);
  };

  const closePhotoZoom = () => {
    if (window.history.state?.msavdoPhotoZoom) {
      window.history.back();
    } else {
      setIsPhotoZoomed(false);
    }
  };

  const moveMedia = (direction: -1 | 1) => {
    if (mediaSlides.length < 2) return;
    setSelectedMediaIndex((currentIndex) => (
      (currentIndex + direction + mediaSlides.length) % mediaSlides.length
    ));
    setIsPhotoZoomed(false);
  };

  useEffect(() => {
    if (activeVariant?.image_url) {
      const variantImageIndex = mediaSlides.findIndex(
        (slide) => slide.type === 'photo' && slide.src === activeVariant.image_url
      );
      if (variantImageIndex >= 0) setSelectedMediaIndex(variantImageIndex);
    }
  }, [activeVariant, mediaSlides]);

  const currentMedia = mediaSlides[selectedMediaIndex];
  useEffect(() => {
    setPhotoAspectRatio(1);
  }, [product?.id, currentMedia?.src]);

  const currentImage = currentMedia?.type === 'photo'
    ? currentMedia.src
    : activeVariant?.image_url || product?.main_image || allGalleryImages[0] || '';

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
    setSelectedMediaIndex(0);
    setAdded(false);
    setSelectedQuantity(1);
    setIsQuantityPickerOpen(false);
    setIsPhotoZoomed(false);
  }, [product?.id]);

  const moveZoomedPhoto = (direction: -1 | 1) => {
    if (allGalleryImages.length < 2) return;
    const currentPhotoIndex = allGalleryImages.indexOf(currentMedia?.src || currentImage);
    const nextPhotoIndex = (Math.max(currentPhotoIndex, 0) + direction + allGalleryImages.length) % allGalleryImages.length;
    const nextMediaIndex = mediaSlides.findIndex(
      (slide) => slide.type === 'photo' && slide.src === allGalleryImages[nextPhotoIndex]
    );
    if (nextMediaIndex >= 0) setSelectedMediaIndex(nextMediaIndex);
  };

  useEffect(() => {
    if (!isPhotoZoomed) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePhotoZoom();
      if (event.key === 'ArrowLeft') moveZoomedPhoto(-1);
      if (event.key === 'ArrowRight') moveZoomedPhoto(1);
    };
    const closeOnBack = (event: PopStateEvent) => {
      if (!event.state?.msavdoPhotoZoom) setIsPhotoZoomed(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('popstate', closeOnBack);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('popstate', closeOnBack);
    };
  }, [isPhotoZoomed]);

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
      quantity: selectedQuantity,
      stock: activeVariant.stock,
      delivery_type: product.delivery_type || 'order',
    };
  };

  const handleAddToCart = () => {
    if (!isQuantityPickerOpen) {
      setIsQuantityPickerOpen(true);
      setAdded(false);
      return;
    }
    const cartItem = createCartItem();
    if (!cartItem) return;
    onAddToCart(cartItem);
    setAdded(true);
    setIsQuantityPickerOpen(false);
    setSelectedQuantity(1);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleOrderNow = () => {
    const cartItem = createCartItem();
    if (cartItem) onOrderNow(cartItem);
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-4 bg-slate-900/70 backdrop-blur-md animate-fade-in">
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
        <div className="sticky top-0 z-30 -mb-10 flex h-10 shrink-0 items-start justify-end gap-1.5 p-1.5 pointer-events-none">
          <ProductShareButton product={product} className="pointer-events-auto" menuAlignment="right" />
          <button
            onClick={onClose}
            className="pointer-events-auto rounded-full bg-white/95 p-2 text-slate-500 shadow-md transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label={t('close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2.5 p-2.5 md:grid-cols-2 sm:gap-5 sm:p-6 lg:gap-8">
          
          {/* Левая колонка: единая галерея изображений и видео */}
          <div className="space-y-1.5 sm:space-y-3">
            {/* Главный блок показа */}
            <div
              style={{ aspectRatio: currentMedia?.type === 'video' ? '16 / 9' : photoAspectRatio }}
              className="relative w-full aspect-square touch-pan-y overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100 shadow-sm sm:rounded-2xl"
              onTouchStart={(event) => {
                const touch = event.touches[0];
                galleryTouchStart.current = { x: touch.clientX, y: touch.clientY };
              }}
              onTouchEnd={(event) => {
                const start = galleryTouchStart.current;
                galleryTouchStart.current = null;
                if (!start || edgeSwipeStart.current) return;
                const touch = event.changedTouches[0];
                const deltaX = touch.clientX - start.x;
                const deltaY = touch.clientY - start.y;
                if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
                  moveMedia(deltaX < 0 ? 1 : -1);
                }
              }}
            >
              {currentMedia?.type === 'video' ? (
                (() => {
                  const targetVideo = currentMedia.src;
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
                  src={currentMedia?.src || currentImage}
                  alt={product.title}
                  referrerPolicy="no-referrer"
                  onLoad={(event) => {
                    const { naturalWidth, naturalHeight } = event.currentTarget;
                    if (naturalWidth > 0 && naturalHeight > 0) {
                      setPhotoAspectRatio(naturalWidth / naturalHeight);
                    }
                  }}
                  onClick={openPhotoZoom}
                  className="h-full w-full object-contain transition-all duration-300 cursor-zoom-in"
                />
              )}
              {currentMedia?.type !== 'video' && (
                <button
                  type="button"
                  onClick={openPhotoZoom}
                  aria-label={t('zoomPhoto')}
                  className="absolute right-2 top-2 rounded-full bg-slate-950/70 p-2 text-white shadow-md transition hover:bg-slate-950"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
              )}

              <div className="absolute top-2 left-2 bg-slate-900/75 text-white text-[9px] font-mono font-bold px-2 py-0.5 rounded-md shadow-xs">
                {activeVariant?.variant_sku || product.base_sku}
              </div>

              {productVideos.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const firstVideoIndex = mediaSlides.findIndex((slide) => slide.type === 'video');
                    if (firstVideoIndex >= 0) setSelectedMediaIndex(firstVideoIndex);
                    setIsPhotoZoomed(false);
                  }}
                  aria-label={`${t('videoReview')}${productVideos.length > 1 ? ` · ${productVideos.length}` : ''}`}
                  className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-md transition hover:bg-emerald-700 active:scale-95"
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span>{t('videoReview')}</span>
                  {productVideos.length > 1 && <span>· {productVideos.length}</span>}
                </button>
              )}

              {product.delivery_type === 'stock' ? (
                <div className="absolute bottom-2 left-2 bg-[#f4c542]/95 text-slate-900 text-[9px] font-bold px-2 py-1 rounded-md shadow-xs flex items-center gap-1">
                  <Truck className="w-3 h-3" />
                  <span>В наличии</span>
                </div>
              ) : (
                <div className="absolute bottom-2 left-2 bg-[#f4c542]/95 text-slate-900 text-[9px] font-bold px-2 py-1 rounded-md shadow-xs flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Доставка 12–35 дней</span>
                </div>
              )}
            </div>

            {/* Общая лента миниатюр фотографий и видео */}
            {mediaSlides.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {mediaSlides.map((slide, idx) => {
                  const isSelected = selectedMediaIndex === idx;
                  return (
                    <button
                      key={`${slide.type}-${slide.src}`}
                      onClick={() => {
                        setSelectedMediaIndex(idx);
                        closePhotoZoom();
                      }}
                      aria-label={slide.type === 'video'
                        ? `${t('videoReview')} ${productVideos.indexOf(slide.src) + 1}`
                        : `${t('photo')} ${idx + 1}`}
                      className={`relative w-11 h-11 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl overflow-hidden border-2 shrink-0 transition-all ${
                        isSelected
                          ? 'border-emerald-600 ring-2 ring-emerald-500/30 scale-105'
                          : 'border-slate-200 hover:border-slate-400 opacity-80 hover:opacity-100'
                      }`}
                    >
                      {slide.type === 'photo' ? (
                        <img
                          src={slide.src}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <>
                          <img
                            src={currentImage}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-slate-950/40 text-white text-lg">▶</span>
                        </>
                      )}
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
          <div className="flex flex-col justify-between space-y-2 sm:space-y-4">
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
              <div className="mt-1 sm:mt-2.5 p-2 sm:p-3.5 bg-gradient-to-br from-slate-50 to-slate-100/70 border border-slate-200/90 rounded-xl sm:rounded-2xl flex items-center justify-between">
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
                <div className="hidden md:flex mt-2.5 p-2.5 bg-[#fff7db] border border-[#ecd17c] rounded-xl items-center gap-2 text-xs text-slate-800 shadow-xs">
                  <Truck className="w-4 h-4 shrink-0" />
                  <span><strong>В наличии</strong> — на складе в Душанбе</span>
                </div>
              ) : (
                <div className="hidden md:flex mt-2.5 p-2.5 bg-[#fff7db] border border-[#ecd17c] rounded-xl items-center gap-2 text-xs text-slate-800 shadow-xs">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span><strong>Доставка 12–35 дней</strong></span>
                </div>
              )}

              {/* 1. КОНФИГУРАТОР ЦВЕТА (Круглые иконки / плашки) */}
              {availableColors.length > 0 && availableColors[0].name !== 'Стандарт' && (
                <div className="mt-2.5 space-y-1 sm:mt-4 sm:space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-900">
                      {t('selectedColor')} <span className="font-medium text-emerald-800">{selectedColor}</span>
                    </span>
                    <span className="text-slate-400 text-[11px]">{availableColors.length} вар.</span>
                  </div>

                  <div className="flex flex-wrap gap-1 sm:gap-1.5">
                    {availableColors.map((col) => {
                      const isSelected = selectedColor === col.name;
                      return (
                        <button
                          key={col.name}
                          type="button"
                          onClick={() => setSelectedColor(col.name)}
                          className={`group relative flex items-center gap-1 px-1.5 py-1 sm:gap-1.5 sm:px-2 sm:py-1.5 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-semibold transition-all duration-150 ${
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
                              className="w-7 h-7 sm:w-8 sm:h-8 rounded-md object-cover border border-white/60 shadow-sm"
                            />
                          ) : (
                            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-gradient-to-tr from-slate-700 to-slate-400 border border-white/50" />
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
                <div className="mt-2.5 space-y-1 sm:mt-4 sm:space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-900">
                      {t('selectedSize')} <span className="font-medium text-emerald-800">{selectedSize}</span>
                    </span>
                    <span className="text-slate-400 text-[11px]">Таблица размеров</span>
                  </div>

                  <div className="flex flex-wrap gap-1 sm:gap-1.5">
                    {availableSizesForColor.map((size) => {
                      const isSelected = selectedSize === size;
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setSelectedSize(size)}
                          className={`min-w-8 h-7 sm:min-w-10 sm:h-9 px-1.5 sm:px-2.5 flex items-center justify-center rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold font-mono transition-all duration-150 ${
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
              <div className="mt-2.5 border-t border-slate-100 pt-2.5 sm:mt-4 sm:pt-3">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 font-heading">
                    {t('description')}
                  </h4>
                </div>
                <div className="product-description-panel bg-gradient-to-br from-amber-50/40 via-slate-50 to-emerald-50/20 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="product-description-text text-[11px] sm:text-sm text-slate-700 leading-relaxed font-normal whitespace-pre-line">
                    {product.description || 'Качественные фабричные материалы, продуманная эргономика и надежность в повседневном использовании.'}
                  </div>
                </div>
              </div>
            </div>

            {/* Кнопка добавления в корзину */}
            <div className="sticky bottom-0 z-10 -mx-3 space-y-2 border-t border-slate-200/80 bg-white/95 px-3 pb-1.5 pt-2 backdrop-blur sm:static sm:mx-0 sm:space-y-2.5 sm:bg-transparent sm:p-0">
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleOrderNow}
              className="min-h-11 min-w-0 flex-1 truncate rounded-xl bg-[#f4c542] px-2 py-2.5 text-xs font-bold tracking-wide text-slate-950 shadow-sm transition hover:bg-[#eabd32] active:scale-[0.98] sm:px-4 sm:py-3 sm:text-sm"
              >
                {t('orderNow')} · {currentPriceTjs} TJS
              </button>
              <div
                aria-hidden={!isQuantityPickerOpen}
                className={`overflow-hidden transition-[max-width,opacity] duration-200 ease-out ${
                  isQuantityPickerOpen ? 'max-w-24 opacity-100' : 'max-w-0 opacity-0'
                }`}
              >
                <div className="flex w-24 shrink-0 items-center justify-between rounded-xl border border-slate-200 bg-white">
                  <button
                    type="button"
                    tabIndex={isQuantityPickerOpen ? 0 : -1}
                    onClick={() => setSelectedQuantity((quantity) => Math.max(1, quantity - 1))}
                    aria-label={t('decreaseQuantity')}
                    className="p-1.5 text-slate-600 transition hover:bg-slate-100"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-5 text-center text-sm font-bold text-slate-900">{selectedQuantity}</span>
                  <button
                    type="button"
                    tabIndex={isQuantityPickerOpen ? 0 : -1}
                    onClick={() => setSelectedQuantity((quantity) => Math.min(99, quantity + 1))}
                    aria-label={t('increaseQuantity')}
                    className="p-1.5 text-slate-600 transition hover:bg-slate-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddToCart}
                aria-label={isQuantityPickerOpen ? `${t('addToCart')}: ${selectedQuantity}` : t('addToCart')}
                title={isQuantityPickerOpen ? `${t('addToCart')}: ${selectedQuantity}` : t('addToCart')}
                aria-expanded={isQuantityPickerOpen}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 transition hover:bg-slate-50 sm:h-12 sm:w-12"
              >
                {added
                  ? <Check className="h-5 w-5" />
                  : <ShoppingBasket className="h-5 w-5" />}
              </button>
              </div>

              {added && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-800"
                >
                  <Check className="h-4 w-4" />
                  <span>{t('addedToCart')}</span>
                </div>
              )}
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
    {isPhotoZoomed && currentMedia?.type !== 'video' && (
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 p-3 sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-label={t('zoomPhoto')}
        onClick={(event) => {
          if (event.target === event.currentTarget) closePhotoZoom();
        }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          zoomTouchStart.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const start = zoomTouchStart.current;
          zoomTouchStart.current = null;
          if (!start) return;
          const touch = event.changedTouches[0];
          const deltaX = touch.clientX - start.x;
          const deltaY = touch.clientY - start.y;
          if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
            moveZoomedPhoto(deltaX < 0 ? 1 : -1);
          }
        }}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            closePhotoZoom();
          }}
          aria-label={t('close')}
          className="absolute right-3 top-3 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
        >
          <X className="h-5 w-5" />
        </button>
        <img
          src={currentMedia?.src || currentImage}
          alt={product.title}
          referrerPolicy="no-referrer"
          onClick={(event) => event.stopPropagation()}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    )}
    </>
  );
};
