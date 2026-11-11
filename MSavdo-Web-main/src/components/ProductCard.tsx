import React, { useState } from 'react';
import { Product } from '../types';
import { Eye, Truck, Clock, BadgePercent } from 'lucide-react';
import { useI18n } from '../i18n';
import { calculateDiscountedPriceTjs } from '../utils/pricing';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  isPriority?: boolean;
  onPriorityImageReady?: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onSelect,
  isPriority = false,
  onPriorityImageReady,
}) => {
  const { t, language } = useI18n();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const cardImageUrl = product.main_image
    ? (() => {
      const imageUrl = new URL(product.main_image, window.location.origin);
      imageUrl.searchParams.set('width', '640');
      return imageUrl.href;
    })()
    : '';

  // Цены по доступным вариантам
  const variants = product.variants || [];

  // Диапазон цен в TJS
  const prices = variants.map((variant) => {
    if (variant.original_price_tjs !== undefined) return variant.price_tjs;
    return calculateDiscountedPriceTjs(variant.price_tjs, product.discount_percent || 0);
  }).filter((price) => price > 0);
  const originalPrices = variants.map((variant) => variant.original_price_tjs ?? variant.price_tjs).filter((price) => price > 0);
  const minPrice = prices.length > 0
    ? Math.min(...prices)
    : calculateDiscountedPriceTjs(product.min_price_tjs || 0, product.discount_percent || 0);
  const maxPrice = prices.length > 0
    ? Math.max(...prices)
    : calculateDiscountedPriceTjs(product.max_price_tjs || 0, product.discount_percent || 0);
  const minOriginalPrice = originalPrices.length > 0 ? Math.min(...originalPrices) : (product.min_price_tjs || 0);
  const hasDiscount = (product.discount_percent || 0) > 0 && minOriginalPrice > minPrice;
  const quantityDeals = Array.from(new Map(
    variants
      .filter((variant) => (variant.quantity_discount_min || 0) >= 2 && (variant.quantity_discount_percent || 0) > 0)
      .map((variant) => [`${variant.quantity_discount_min}-${variant.quantity_discount_percent}`, variant]),
  ).values());
  const quantityDealLabel = quantityDeals.length === 0
    ? ''
    : (() => {
      const minimum = Math.min(...quantityDeals.map((deal) => deal.quantity_discount_min || 2));
      const maximum = Math.max(...quantityDeals.map((deal) => deal.quantity_discount_percent || 0));
      return language === 'ru' ? `Скидки от ${minimum} шт. до ${maximum}%`
        : language === 'tg' ? `Тахфиф аз ${minimum} дона то ${maximum}%`
        : `Discounts from ${minimum} pcs up to ${maximum}%`;
    })();

  const isStock = product.delivery_type === 'stock';
  const productSlug = product.title
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'product';
  const productUrl = `/product/${product.id}/${encodeURIComponent(productSlug)}`;

  return (
    <article 
      onClick={() => onSelect(product)}
      className="group flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-sm border border-slate-200 bg-white transition-colors hover:border-amber-400"
    >
      {/* Изображение */}
      <div className="relative aspect-square bg-slate-100 overflow-hidden flex items-center justify-center">
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 bg-slate-200 animate-pulse" />
        )}

        {product.main_image && !imageError ? (
          <a
            href={productUrl}
            aria-label={product.title}
            className="absolute inset-0 flex items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={cardImageUrl}
              alt={product.title}
              referrerPolicy="no-referrer"
              onLoad={() => {
                setImageLoaded(true);
                if (isPriority) onPriorityImageReady?.();
              }}
              onError={() => {
                setImageError(true);
                if (isPriority) onPriorityImageReady?.();
              }}
              width={640}
              height={640}
              fetchPriority={isPriority ? 'high' : 'auto'}
              className={`block w-full h-full object-contain group-hover:scale-105 transition-transform duration-500 ease-out ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              loading={isPriority ? 'eager' : 'lazy'}
            />
          </a>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-4 text-center">
            <span className="text-xs font-semibold text-slate-400 font-heading">M.Savdo Gallery</span>
          </div>
        )}

        {/* Срок доставки */}
        {isStock ? (
          <div className="absolute bottom-1 left-1 flex max-w-[calc(100%-0.5rem)] items-center gap-0.5 rounded-sm bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold leading-tight text-emerald-800">
            <Truck className="w-2.5 h-2.5 shrink-0" />
            <span className="min-w-0 leading-tight">{t('inStockOneDay')}</span>
          </div>
        ) : (
          <div className="absolute bottom-1 left-1 flex max-w-[calc(100%-0.5rem)] items-center gap-0.5 rounded-sm bg-[#f4c542] px-1.5 py-0.5 text-[9px] font-bold leading-tight text-black">
            <Clock className="w-2.5 h-2.5 shrink-0" />
            <span className="min-w-0 leading-tight">{t('delivery18to30')}</span>
          </div>
        )}
        {hasDiscount && (
          <div className="absolute left-2 top-2 rounded-md bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-slate-950 shadow-sm">
            −{product.discount_percent}%
          </div>
        )}

        {/* Быстрый выбор при наведении */}
        <div className="pointer-events-none absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="bg-amber-400 text-black text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-lg flex items-center gap-1.5 transform translate-y-2 group-hover:translate-y-0 transition-transform">
            <Eye className="w-3.5 h-3.5" />
            <span>Выбрать</span>
          </div>
        </div>
      </div>

      {/* Информация о товаре */}
      <div className="flex flex-1 flex-col gap-0.5 px-2 py-1.5">
        <div>
          <h3 className="line-clamp-2 text-[12px] font-semibold leading-[1.15] text-slate-900 transition-colors group-hover:text-amber-700 sm:text-sm">
            <a
              href={productUrl}
              className="text-inherit no-underline"
              onClick={(event) => event.stopPropagation()}
            >
              {product.title}
            </a>
          </h3>
        </div>

        {quantityDealLabel && (
          <div className="flex items-center gap-1 text-[10px] font-semibold leading-tight text-emerald-700 sm:text-xs">
            <BadgePercent className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{quantityDealLabel}</span>
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-1 gap-y-0.5 pt-0.5">
          <div className="min-w-0">
            {hasDiscount && (
              <div className="mb-1 text-[10px] font-semibold leading-none text-slate-500 line-through">
                {minOriginalPrice.toLocaleString('ru-RU')} с.
              </div>
            )}
            <div className={`text-[16px] font-extrabold leading-none tracking-tight sm:text-lg ${hasDiscount ? 'product-sale-price' : 'text-slate-950 price-text'}`}>
              {maxPrice > minPrice && <span className="mr-0.5 text-[10px] font-bold text-slate-500 sm:text-xs">{t('priceFrom')}</span>}
              {minPrice.toLocaleString('ru-RU')}
              <span className="ml-1 text-[9px] font-bold text-slate-600 sm:text-[10px]">с.</span>
            </div>
          </div>
          <span className={`text-[9px] font-semibold leading-tight sm:text-[10px] ${isStock ? 'text-emerald-700' : 'text-slate-500'}`}>
            {isStock ? t('inStock') : t('onOrder')}
          </span>
        </div>
      </div>
    </article>
  );
};
