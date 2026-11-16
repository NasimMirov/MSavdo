import React, { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw, Star, X } from 'lucide-react';
import { apiFetch } from '../api';

interface Review {
  id: number; product_id: number; product_title: string; customer_name: string;
  rating: number; review_text: string; status: string; created_at: string;
}

export const ProductReviewsAdmin: React.FC = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await apiFetch(`/api/admin/product-reviews?status=${status}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json(); setReviews(data.reviews || []);
    } catch { setError('Не удалось загрузить отзывы. Обновите страницу и попробуйте ещё раз.'); }
    finally { setLoading(false); }
  }, [status]);
  useEffect(() => { void load(); }, [load]);
  const moderate = async (id: number, nextStatus: 'approved' | 'rejected') => {
    if (nextStatus === 'approved' && !window.confirm('Подтвердите, что отзыв оставил реальный покупатель, а заказ можно проверить в заказах.')) return;
    setSavingId(id); setError('');
    try {
      const response = await apiFetch(`/api/admin/product-reviews/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus, purchase_verified: nextStatus === 'approved' }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setReviews((items) => items.filter((item) => item.id !== id));
    } catch { setError('Не удалось изменить статус отзыва.'); }
    finally { setSavingId(null); }
  };
  return <section className="space-y-4 py-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-sm font-extrabold text-slate-900">Отзывы о товарах</h2><p className="mt-1 text-xs text-slate-500">На сайт и в Google-разметку попадают только одобренные отзывы.</p></div>
      <button type="button" disabled={loading} onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"><RefreshCw className="h-3.5 w-3.5"/>Обновить</button>
    </header>
    <div className="flex gap-2">{(['pending','approved','rejected'] as const).map((value) => <button key={value} type="button" onClick={() => setStatus(value)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${status === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{value === 'pending' ? 'На проверке' : value === 'approved' ? 'Опубликованные' : 'Отклонённые'}</button>)}</div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {loading && !reviews.length && <p className="text-sm text-slate-500">Загрузка…</p>}
    {!loading && !reviews.length && <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Здесь пока нет отзывов.</p>}
    <div className="space-y-3">{reviews.map((review) => <article key={review.id} className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-900">{review.product_title}</p><p className="mt-1 text-xs text-slate-600">{review.customer_name} · {new Date(`${review.created_at.replace(' ', 'T')}Z`).toLocaleDateString('ru-RU')}</p><p className="mt-1 flex text-amber-500" aria-label={`Оценка ${review.rating} из 5`}>{Array.from({length: review.rating}, (_, index) => <Star key={index} className="h-3.5 w-3.5 fill-current"/>)}</p></div>
      {status === 'pending' && <div className="flex gap-2"><button type="button" disabled={savingId !== null} onClick={() => void moderate(review.id, 'approved')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Check className="h-3.5 w-3.5"/>Опубликовать</button><button type="button" disabled={savingId !== null} onClick={() => void moderate(review.id, 'rejected')} aria-label="Отклонить отзыв" className="rounded-lg border border-red-200 p-2 text-red-700 disabled:opacity-50"><X className="h-4 w-4"/></button></div>}</div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{review.review_text}</p>
    </article>)}</div>
  </section>;
};
