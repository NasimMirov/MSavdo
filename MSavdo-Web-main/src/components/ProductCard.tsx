import React, { useState } from 'react';
import { Product } from '../types';
import { ShoppingBag, Eye, Truck, Clock } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  onAddToCart: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onSelect,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Варианты и цвета
  const variants = product.variants || [];
  const uniqueColors = Array.from(new Set(variants.map(v => v.color).filter(Boolean)));
  const uniqueSizes = Array.from(new Set(variants.map(v => v.size).filter(Boolean)));

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
        <div className="absolute top-2.5 left-2.5 bg-black/85 backdrop-blur-md text-amber-400 text-[9px] sm:text-[10px] font-mono font-bold px-2 py-0.5 rounded-md shadow-xs border border-amber-400/20">
          {product.base_sku}
        </div>

        {/* Срок доставки */}
        {isStock ? (
          <div className="absolute top-2.5 right-2.5 bg-emerald-600/95 backdrop-blur-md text-white text-[9px] font-bold px-2 py-0.5 rounded-md shadow-xs border border-emerald-400/40 flex items-center gap-1">
            <Truck className="w-3 h-3 text-white" />
            <span>В наличии (1 день)</span>
          </div>
        ) : (
          <div className="absolute top-2.5 right-2.5 bg-black/85 backdrop-blur-md text-amber-300 text-[9px] font-bold px-2 py-0.5 rounded-md shadow-xs border border-amber-400/20 flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>Под заказ 15–30 дн.</span>
          </div>
        )}

        {/* Индикатор вариантов */}
        {uniqueColors.length > 0 && (
          <div className="absolute bottom-2.5 left-2.5 bg-black/80 backdrop-blur-md text-slate-100 text-[9px] sm:text-[10px] font-medium px-2 py-0.5 rounded-md shadow-xs flex items-center gap-1.5 border border-slate-700">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            <span>{uniqueColors.length} {uniqueColors.length === 1 ? 'цвет' : uniqueColors.length < 5 ? 'цвета' : 'цветов'}</span>
            {uniqueSizes.length > 0 && uniqueSizes[0] !== 'One Size' && (
              <>
                <span className="text-slate-500">·</span>
                <span>{uniqueSizes.length} разм.</span>
              </>
            )}
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
      <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1 mb-1">
            <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider truncate">
              {product.category_name || 'Каталог'}
            </div>
            {(product.views_count || 0) > 0 && (
              <div className="text-[9px] text-slate-400 font-mono font-medium flex items-center gap-0.5 shrink-0" title="Количество просмотров">
                <span>👁</span>
                <span>{product.views_count}</span>
              </div>
            )}
          </div>

          <h3 className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-2 leading-snug font-heading group-hover:text-amber-600 transition-colors">
            {product.title}
          </h3>
        </div>

        {/* Цена и кнопка */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
          <div>
            <div className="text-[9px] text-slate-400 font-medium">в сомони</div>
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
            title="Открыть карточку товара"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Выбрать</span>
          </button>
        </div>
      </div>
    </article>
  );
};
