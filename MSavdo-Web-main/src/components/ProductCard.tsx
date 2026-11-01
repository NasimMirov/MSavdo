import React, { useState } from 'react';
import { Product } from '../types';
import { Eye, Truck, Clock, Share2, Check } from 'lucide-react';
import { useI18n } from '../i18n';
import { shareProduct } from '../utils/productSharing';

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
  const [shareCopied, setShareCopied] = useState(false);

  // Цены по доступным вариантам
  const variants = product.variants || [];

  // Диапазон цен в TJS
  const prices = variants.map(v => v.price_tjs).filter(p => p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : (product.min_price_tjs || 0);
  const maxPrice = prices.length > 0 ? Math.max(...prices) : (product.max_price_tjs || 0);

  const isStock = product.delivery_type === 'stock';
  const productSlug = product.title
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'product';
  const productUrl = `/product/${product.id}/${encodeURIComponent(productSlug)}`;

  const handleShare = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    try {
      const result = await shareProduct(product);
      if (result === 'copied') {
        setShareCopied(true);
        window.setTimeout(() => setShareCopied(false), 2000);
      }
    } catch (error) {
      console.error('[Product Share]', error);
    }
  };

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
            className="contents"
            onClick={(event) => event.stopPropagation()}
          >
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
          </a>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-4 text-center">
            <span className="text-xs font-semibold text-slate-400 font-heading">M.Savdo Gallery</span>
          </div>
        )}

        {/* Артикул коллекции */}
        <div className="absolute top-1.5 left-1.5 bg-white/95 text-slate-800 text-[7px] sm:text-[8px] font-mono font-bold px-1 py-0.5 rounded shadow-xs border border-slate-200/70">
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

        <button
          type="button"
          onClick={handleShare}
          aria-label={shareCopied ? 'Ссылка скопирована' : `Поделиться: ${product.title}`}
          title={shareCopied ? 'Ссылка скопирована' : 'Поделиться'}
          className="absolute bottom-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-md transition hover:bg-amber-400 hover:text-slate-950 active:scale-95"
        >
          {shareCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
        </button>

        {/* Быстрый выбор при наведении */}
        <div className="pointer-events-none absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="bg-amber-400 text-black text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-lg flex items-center gap-1.5 transform translate-y-2 group-hover:translate-y-0 transition-transform">
            <Eye className="w-3.5 h-3.5" />
            <span>Выбрать</span>
          </div>
        </div>
      </div>

      {/* Информация о товаре */}
      <div className="flex flex-1 flex-col p-2.5 sm:p-4">
        <div className="flex-1">
          <div className="mb-1.5 text-[8px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:text-[9px]">
            <span className="line-clamp-1">{product.category_name || 'Каталог'}</span>
          </div>

          <h3 className="min-h-[2.5rem] text-[11px] font-bold leading-snug text-slate-900 line-clamp-2 transition-colors group-hover:text-amber-600 font-heading sm:min-h-[3rem] sm:text-sm">
            <a
              href={productUrl}
              className="text-inherit no-underline"
              onClick={(event) => event.stopPropagation()}
            >
              {product.title}
            </a>
          </h3>
        </div>

        <div className="mt-3 flex items-end justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2 sm:px-3">
          <div className="min-w-0">
            <div className="text-[8px] font-medium text-slate-500 sm:text-[9px]">{t('inSomoni')}</div>
            <div className="mt-0.5 whitespace-nowrap text-base font-extrabold leading-none tracking-tight text-slate-950 sm:text-lg">
              {maxPrice > minPrice && <span className="mr-1 text-[10px] font-semibold text-slate-500 sm:text-xs">от</span>}
              {minPrice}
              <span className="ml-1 text-[9px] font-bold text-slate-500 sm:text-[10px]">с.</span>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[8px] font-semibold text-slate-500 shadow-sm sm:text-[9px]">
            Открыть товар
          </span>
        </div>
      </div>
    </article>
  );
};
