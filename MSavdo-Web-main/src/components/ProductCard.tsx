import React, { useState } from 'react';
import { Product } from '../types';
import { ShoppingBasket, Eye, Truck, Clock } from 'lucide-react';
import { useI18n } from '../i18n';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  onAddToCart: (product: Product) => void;
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
  const prices = variants.map(v => v.price_tjs).filter(p => p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : (product.min_price_tjs || 0);
  const maxPrice = prices.length > 0 ? Math.max(...prices) : (product.max_price_tjs || 0);

  const priceDisplay = minPrice === maxPrice || maxPrice === 0 
    ? `${minPrice} с.` 
    : `от ${minPrice} с.`;

  const isStock = product.delivery_type === 'stock';

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
          <img
            src={product.main_image}
            alt={product.title}
            referrerPolicy="no-referrer"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-4 text-center">
            <span className="text-xs font-semibold text-slate-400 font-heading">M.Savdo Gallery</span>
          </div>
        )}

        {/* Артикул коллекции */}
        <div className="absolute top-2 left-2 bg-white/95 text-slate-800 text-[8px] sm:text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md shadow-xs border border-slate-200/80">
          {product.base_sku}
        </div>

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

        {/* Быстрый выбор при наведении */}
        <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="bg-amber-400 text-black text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-lg flex items-center gap-1.5 transform translate-y-2 group-hover:translate-y-0 transition-transform">
            <Eye className="w-3.5 h-3.5" />
            <span>Выбрать</span>
          </div>
        </div>
      </div>

      {/* Информация о товаре */}
      <div className="p-2.5 sm:p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <div className="text-[9px] sm:text-[10px] font-bold text-amber-600 uppercase tracking-wider truncate">
              {product.category_name || 'Каталог'}
            </div>
          </div>

          <h3 className="text-[11px] sm:text-sm font-bold text-slate-900 line-clamp-2 leading-snug font-heading group-hover:text-amber-600 transition-colors">
            {product.title}
          </h3>
        </div>

        {/* Цена и кнопка */}
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
          <div>
            <div className="text-[9px] text-slate-400 font-medium">{t('inSomoni')}</div>
            <div className="text-sm sm:text-base font-extrabold text-slate-900 font-mono tracking-tight">
              {priceDisplay}
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(product);
            }}
            className="p-2 sm:px-3 sm:py-1.5 bg-black hover:bg-amber-400 hover:text-black text-amber-400 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1 active:scale-95 border border-amber-400/30"
            title={t('chooseProduct')}
          >
            <ShoppingBasket className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('chooseProduct')}</span>
          </button>
        </div>
      </div>
    </article>
  );
};
