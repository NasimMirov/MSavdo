import React, { useEffect, useMemo, useState } from 'react';
import { Check, Percent, Search } from 'lucide-react';
import { apiFetch } from '../api';
import type { Product } from '../types';
import { calculateDiscountedPriceTjs } from '../utils/pricing';

interface ProductDiscountsAdminProps {
  products: Product[];
  onSaved: () => void;
}

export const ProductDiscountsAdmin: React.FC<ProductDiscountsAdminProps> = ({ products, onSaved }) => {
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setDrafts(Object.fromEntries(products.map((product) => [product.id, String(product.discount_percent || 0)])));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru');
    return products.filter((product) => !normalizedQuery || product.title.toLocaleLowerCase('ru').includes(normalizedQuery))
      .sort((a, b) => Number(Boolean(b.discount_percent)) - Number(Boolean(a.discount_percent)) || a.title.localeCompare(b.title, 'ru'));
  }, [products, query]);

  const saveDiscount = async (product: Product) => {
    const discountPercent = Number(drafts[product.id]);
    if (!Number.isSafeInteger(discountPercent) || discountPercent < 0 || discountPercent > 90) {
      setError('Скидка должна быть целым числом от 0 до 90%.');
      setNotice('');
      return;
    }

    setSavingId(product.id);
    setError('');
    setNotice('');
    try {
      const response = await apiFetch(`/api/admin/products/${product.id}/discount`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discount_percent: discountPercent }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setNotice(discountPercent ? `Скидка на «${product.title}» сохранена.` : `Скидка на «${product.title}» снята.`);
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить скидку.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <header>
        <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
          <Percent className="h-5 w-5 text-amber-500" />
          Скидки на товары
        </h2>
        <p className="mt-1 text-xs text-slate-500">Процент применяется ко всем вариантам товара. Укажите 0, чтобы снять скидку.</p>
      </header>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти товар"
          className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-amber-400"
        />
      </label>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">{notice}</p>}

      <div className="max-h-[65vh] space-y-2 overflow-y-auto">
        {filteredProducts.map((product) => {
          const currentDiscount = Number(drafts[product.id] || 0);
          const originalPrice = product.min_price_tjs || 0;
          const salePrice = calculateDiscountedPriceTjs(originalPrice, currentDiscount);
          return (
            <article key={product.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center">
              <img src={product.main_image || '/placeholder.png'} alt="" className="hidden h-12 w-12 rounded-lg object-cover sm:block" />
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-sm font-bold text-slate-800">{product.title}</h3>
                {originalPrice > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Обычная цена: {originalPrice} TJS
                    {currentDiscount > 0 && <> · со скидкой: <strong className="text-emerald-700">{salePrice} TJS</strong></>}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 sm:w-44">
                <label className="flex min-w-0 flex-1 items-center rounded-lg border border-slate-200 px-2">
                  <input
                    type="number"
                    min="0"
                    max="90"
                    step="1"
                    inputMode="numeric"
                    value={drafts[product.id] ?? '0'}
                    onChange={(event) => setDrafts((current) => ({ ...current, [product.id]: event.target.value }))}
                    aria-label={`Скидка на ${product.title}`}
                    className="w-full py-2 text-sm font-bold outline-none"
                  />
                  <span className="text-xs text-slate-500">%</span>
                </label>
                <button
                  type="button"
                  onClick={() => void saveDiscount(product)}
                  disabled={savingId === product.id}
                  aria-label={`Сохранить скидку на ${product.title}`}
                  className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-50"
                >
                  {savingId === product.id ? '…' : <><Check className="h-3.5 w-3.5" /> Сохранить</>}
                </button>
              </div>
            </article>
          );
        })}
        {!filteredProducts.length && <p className="py-8 text-center text-sm text-slate-500">Товары не найдены.</p>}
      </div>
    </section>
  );
};
