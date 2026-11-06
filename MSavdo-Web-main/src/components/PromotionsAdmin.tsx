import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import type { Category, Product } from '../types';
import type { Promotion } from '../utils/promotions';

type Draft = Omit<Promotion, 'id' | 'uses'>;
const initialDraft = (): Draft => ({
  title: '', kind: 'discount', discount_type: 'percent', discount_value: 10,
  scope: 'order', product_ids: [], category_ids: [], min_quantity: 1, min_total: 0,
  code: '', starts_at: null, ends_at: null, max_uses: null, stackable: false, priority: 0, active: false,
});
const localDate = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const inputClass = 'w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900';

export function PromotionsAdmin({ products, categories }: { products: Product[]; categories: Category[] }) {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((old) => ({ ...old, [key]: value }));

  async function load() {
    try {
      const response = await apiFetch('/api/admin/promotions');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setPromotions(data.promotions);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить акции'); }
  }
  useEffect(() => { void load(); }, []);

  async function save(value: Draft, id: number | null, resetForm = true) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await apiFetch(id ? `/api/admin/promotions/${id}` : '/api/admin/promotions', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (resetForm) { setDraft(initialDraft()); setEditingId(null); }
      setMessage('Акция сохранена. Использования уже оформленных заказов не сбрасываются.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить акцию'); }
    finally { setBusy(false); }
  }
  const selectIds = (field: 'product_ids' | 'category_ids', id: number, checked: boolean) =>
    set(field, checked ? [...draft[field], id] : draft[field].filter((value) => value !== id));
  const flatCategories = categories.flatMap((category) => category.subcategories?.length ? category.subcategories : category.parent_id ? [category] : []);
  const visibleProducts = products.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()) || p.base_sku.toLowerCase().includes(search.toLowerCase()));
  return <section className="space-y-4 py-4">
    <div><h2 className="text-lg font-bold">Акции и промокоды</h2>
      <p className="text-xs text-slate-600">Скидки применяются последовательно по приоритету. Несовместимая акция действует отдельно. Лимит расходуется при оформлении и не возвращается при отмене.</p></div>
    {error && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded bg-emerald-50 p-2 text-sm text-emerald-700">{message}</p>}
    <form className="space-y-3 rounded-xl border bg-white p-4" onSubmit={(event) => { event.preventDefault(); void save(draft, editingId); }}>
      <h3 className="font-bold">{editingId ? `Редактирование акции #${editingId}` : 'Новая акция'}</h3>
      <label className="block text-xs font-semibold">Название<input className={inputClass} required maxLength={120} value={draft.title} onChange={(e) => set('title', e.target.value)} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">Тип<select className={inputClass} value={draft.kind} onChange={(e) => set('kind', e.target.value as Draft['kind'])}>
          <option value="discount">Скидка</option><option value="quantity">Скидка за количество одного товара</option><option value="bundle">Комплект товаров</option><option value="banner">Информационное предложение без скидки</option>
        </select></label>
        <label className="text-xs font-semibold">Область скидки<select className={inputClass} value={draft.scope} onChange={(e) => set('scope', e.target.value as Draft['scope'])}>
          <option value="order">Весь заказ</option><option value="products">Выбранные товары / комплект</option><option value="categories">Категории</option>
        </select></label>
        <label className="text-xs font-semibold">Тип скидки<select className={inputClass} value={draft.discount_type} onChange={(e) => set('discount_type', e.target.value as Draft['discount_type'])}><option value="percent">Процент</option><option value="fixed">Фиксированная сумма TJS</option></select></label>
        <label className="text-xs font-semibold">Размер скидки<input className={inputClass} type="number" min={draft.kind === 'banner' ? 0 : 1} max={draft.discount_type === 'percent' ? 100 : 100000000} required value={draft.discount_value} onChange={(e) => set('discount_value', Number(e.target.value))} /></label>
        <label className="text-xs font-semibold">Минимальная сумма заказа, TJS<input className={inputClass} type="number" min="0" required value={draft.min_total} onChange={(e) => set('min_total', Number(e.target.value))} /></label>
        <label className="text-xs font-semibold">Минимальное количество одного товара<input className={inputClass} type="number" min="1" required value={draft.min_quantity} onChange={(e) => set('min_quantity', Number(e.target.value))} /></label>
        <label className="text-xs font-semibold">Промокод (необязательно)<input className={inputClass} maxLength={40} value={draft.code} onChange={(e) => set('code', e.target.value.toUpperCase())} /></label>
        <label className="text-xs font-semibold">Общий лимит использований (пусто — без лимита)<input className={inputClass} type="number" min="1" value={draft.max_uses ?? ''} onChange={(e) => set('max_uses', e.target.value ? Number(e.target.value) : null)} /></label>
        <label className="text-xs font-semibold">Начало (местное время)<input className={inputClass} type="datetime-local" value={localDate(draft.starts_at)} onChange={(e) => set('starts_at', e.target.value ? new Date(e.target.value).toISOString() : null)} /></label>
        <label className="text-xs font-semibold">Окончание (местное время)<input className={inputClass} type="datetime-local" value={localDate(draft.ends_at)} onChange={(e) => set('ends_at', e.target.value ? new Date(e.target.value).toISOString() : null)} /></label>
        <label className="text-xs font-semibold">Приоритет (больше — раньше)<input className={inputClass} type="number" min="-10000" max="10000" value={draft.priority} onChange={(e) => set('priority', Number(e.target.value))} /></label>
      </div>
      {(draft.scope === 'products' || draft.kind === 'bundle') && <div>
        <label className="text-xs font-semibold">Товары ({draft.product_ids.length} выбрано)<input className={inputClass} placeholder="Поиск товара или артикула" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        {draft.product_ids.filter((id) => !products.some((product) => product.id === id)).map((id) => <div key={id} className="text-xs text-red-700">Товар #{id} не найден. <button type="button" className="underline" onClick={() => selectIds('product_ids', id, false)}>Убрать</button></div>)}
        <div className="max-h-44 overflow-y-auto rounded border p-2">{visibleProducts.map((p) => <label key={p.id} className="block text-xs"><input type="checkbox" checked={draft.product_ids.includes(p.id)} onChange={(e) => selectIds('product_ids', p.id, e.target.checked)} /> {p.title} · {p.base_sku}</label>)}</div>
      </div>}
      {draft.scope === 'categories' && <div className="max-h-44 overflow-y-auto rounded border p-2"><strong className="text-xs">Категории</strong>
        {draft.category_ids.filter((id) => !flatCategories.some((category) => category.id === id)).map((id) => <div key={id} className="text-xs text-red-700">Категория #{id} не найдена. <button type="button" className="underline" onClick={() => selectIds('category_ids', id, false)}>Убрать</button></div>)}
        {flatCategories.map((c) => <label key={c.id} className="block text-xs"><input type="checkbox" checked={draft.category_ids.includes(c.id)} onChange={(e) => selectIds('category_ids', c.id, e.target.checked)} /> {c.name}</label>)}</div>}
      <div className="flex flex-wrap gap-4 text-sm"><label><input type="checkbox" checked={draft.stackable} onChange={(e) => set('stackable', e.target.checked)} /> Совместима с другими скидками</label><label><input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} /> Активна</label></div>
      <div className="flex gap-2"><button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Сохранить</button><button type="button" onClick={() => { setEditingId(null); setDraft(initialDraft()); }} className="rounded-lg border px-4 py-2 text-sm">Очистить форму</button></div>
    </form>
    <div className="space-y-2">{promotions.map((p) => <article key={p.id} className="rounded-xl border bg-white p-3 text-sm">
      <div className="font-bold">{p.title} · {p.active ? 'Активна' : 'Выключена'}</div>
      <p className="text-xs text-slate-600">Использовано: {p.uses}{p.max_uses !== null ? ` / ${p.max_uses}` : ' · без лимита'} · {p.code ? `Код: ${p.code}` : 'Без кода'} · приоритет {p.priority}</p>
      <div className="mt-2 flex gap-2"><button type="button" className="rounded border px-2 py-1" onClick={() => { setDraft(p); setEditingId(p.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Изменить</button>
        <button type="button" className="rounded border px-2 py-1" onClick={() => { setDraft({ ...p, active: false }); setEditingId(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Копировать</button>
        <button type="button" disabled={busy} className="rounded border px-2 py-1" onClick={() => {
          if (editingId === p.id) { setError('Сначала сохраните или очистите редактируемую акцию.'); return; }
          void save({ ...p, active: !p.active }, p.id, false);
        }}>{p.active ? 'Выключить' : 'Включить'}</button></div>
    </article>)}</div>
  </section>;
}
