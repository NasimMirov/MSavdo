import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePromotions, type Promotion } from './promotions.js';

const base: Promotion = {
  id: 1, title: 'Акция', kind: 'discount', discount_type: 'percent', discount_value: 10,
  scope: 'order', product_ids: [], category_ids: [], min_quantity: 1, min_total: 0,
  code: '', starts_at: null, ends_at: null, max_uses: null, uses: 0,
  stackable: true, priority: 0, active: true,
};
const items = [
  { product_id: 1, category_id: 2, quantity: 2, price_tjs: 100 },
  { product_id: 2, category_id: 3, quantity: 1, price_tjs: 100 },
];
const now = new Date('2026-01-01T00:00:00Z');

test('stackable discounts apply sequentially and never exceed total', () => {
  const result = calculatePromotions(items, [base, { ...base, id: 2, discount_type: 'fixed', discount_value: 500 }], '', now);
  assert.deepEqual([result.subtotal, result.discount, result.total], [300, 300, 0]);
});

test('bundle can discount only its members or the full order', () => {
  const bundle = { ...base, kind: 'bundle' as const, product_ids: [1, 2], scope: 'products' as const };
  const extra = [...items, { product_id: 3, category_id: 3, quantity: 1, price_tjs: 100 }];
  assert.equal(calculatePromotions(extra, [bundle], '', now).discount, 30);
  assert.equal(calculatePromotions(extra, [{ ...bundle, scope: 'order' }], '', now).discount, 40);
  assert.equal(calculatePromotions([items[0]], [bundle], '', now).discount, 0);
});

test('quantity threshold is per product and combines its variants', () => {
  const promo = { ...base, kind: 'quantity' as const, min_quantity: 2 };
  assert.equal(calculatePromotions(items, [promo], '', now).discount, 20);
});

test('expired, exhausted, inactive and unmatched codes do not apply', () => {
  const invalid = [
    { ...base, id: 1, ends_at: '2025-12-31T23:59:59Z' },
    { ...base, id: 2, max_uses: 2, uses: 2 },
    { ...base, id: 3, active: false },
    { ...base, id: 4, code: 'SALE' },
  ];
  assert.equal(calculatePromotions(items, invalid, '', now).discount, 0);
  assert.equal(calculatePromotions(items, [invalid[3]], 'sale', now).code_applied, true);
});

test('exclusive promotion prevents stacking in priority order', () => {
  const result = calculatePromotions(items, [{ ...base, stackable: false, priority: 1 }, { ...base, id: 2 }], '', now);
  assert.equal(result.applied.length, 1);
  assert.equal(result.discount, 30);
});

test('empty bundles never apply to a whole order', () => {
  assert.equal(calculatePromotions(items, [{ ...base, kind: 'bundle', product_ids: [] }], '', now).discount, 0);
});

test('product and category targets only reduce matching items', () => {
  assert.equal(calculatePromotions(items, [{ ...base, scope: 'products', product_ids: [2] }], '', now).discount, 10);
  assert.equal(calculatePromotions(items, [{ ...base, scope: 'categories', category_ids: [2] }], '', now).discount, 20);
});
