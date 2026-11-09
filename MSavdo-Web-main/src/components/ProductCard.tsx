import React, { useState } from 'react';
import { Product } from '../types';
import { Eye, Truck, Clock } from 'lucide-react';
import { useI18n } from '../i18n';
import { calculateDiscountedPriceTjs } from '../utils/pricing';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onSelect,
}) => {
  const { t } = useI18n();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

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
    : quantityDeals.length === 1
      ? `От ${quantityDeals[0].quantity_discount_min} шт. −${quantityDeals[0].quantity_discount_percent}%`
      : `Скидка от ${Math.min(...quantityDeals.map((deal) => deal.quantity_discount_min || 2))} шт. на отдельные варианты`;

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
      className="group cursor-pointer bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 overflow-hidden hover:shadow-xl hover:border-amber-400/80 transition-all duration-300 flex flex-col justify-between"
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
              src={product.main_image}
              alt={product.title}
              referrerPolicy="no-referrer"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              className={`block w-full h-full object-contain group-hover:scale-105 transition-transform duration-500 ease-out ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              loading="lazy"
            />
          </a>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-4 text-center">
            <span className="text-xs font-semibold text-slate-400 font-heading">M.Savdo Gallery</span>
          </div>
        )}

        {/* Срок доставки */}
        {isStock ? (
          <div className="absolute top-2 right-2 max-w-[72%] whitespace-nowrap bg-[#f4c542]/95 text-slate-900 text-[8px] font-bold px-1.5 py-0.5 rounded-md shadow-xs flex items-center gap-0.5">
            <Truck className="w-2.5 h-2.5 shrink-0" />
            <span className="min-w-0 leading-tight">{t('inStockOneDay')}</span>
          </div>
        ) : (
          <div className="absolute top-2 right-2 max-w-[72%] whitespace-nowrap bg-[#f4c542]/95 text-slate-900 text-[8px] font-bold px-1.5 py-0.5 rounded-md shadow-xs flex items-center gap-0.5">
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
      <div className="flex flex-col px-2 pb-1.5 pt-2 sm:px-3 sm:pb-2 sm:pt-3">
        <div>
          <div className="mb-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-slate-500 sm:mb-1 sm:text-[9px]">
            <span className="line-clamp-1">{product.category_name || 'Каталог'}</span>
          </div>

          <h3 className="text-[12px] font-bold leading-[1.2] text-slate-900 line-clamp-2 transition-colors group-hover:text-amber-700 font-heading sm:text-sm">
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
          <div className="mt-1.5 flex items-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50 px-1.5 py-1 text-[9px] font-bold leading-tight text-emerald-800 sm:text-[10px]">
            <span aria-hidden="true">▦</span>
            <span>{quantityDealLabel}</span>
          </div>
        )}

        <div className="mt-1.5 flex items-center justify-between gap-1.5 px-0.5 py-0.5 sm:mt-2 sm:px-1 sm:py-1">
          <div className="min-w-0">
            <div className="text-[7px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[8px]">{t('inSomoni')}</div>
            {hasDiscount && (
              <div className="mb-1 whitespace-nowrap text-[10px] font-semibold leading-none text-slate-500 line-through">
                {minOriginalPrice.toLocaleString('ru-RU')} с.
              </div>
            )}
            <div className={`mt-0.5 whitespace-nowrap text-[17px] font-extrabold leading-none tracking-tight sm:text-xl ${hasDiscount ? 'product-sale-price' : 'text-slate-950 price-text'}`}>
              {maxPrice > minPrice && <span className="mr-0.5 text-[10px] font-bold text-slate-500 sm:text-xs">от</span>}
              {minPrice.toLocaleString('ru-RU')}
              <span className="ml-1 text-[9px] font-bold text-slate-600 sm:text-[10px]">с.</span>
            </div>
          </div>
          <span className="shrink-0 text-[7px] font-semibold text-slate-500 sm:text-[8px]">
            {isStock ? 'В наличии' : 'Под заказ'}
          </span>
        </div>
      </div>
    </article>
  );
};
