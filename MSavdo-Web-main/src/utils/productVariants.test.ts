import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductVariant } from '../types';
import { orderableVariants, resolveVariant } from './productVariants';

const variant = (id: number, color: string, size: string, price = 100): ProductVariant => ({
  id, color, size, price_cny: 0, price_tjs: price, stock: 0, weight_kg: 0,
  variant_sku: String(id), image_url: '',
});

test('changing color selects an actual combination instead of an unrelated size', () => {
  const variants = [variant(1, 'Black', 'M'), variant(2, 'Red', 'L')];
  assert.equal(resolveVariant(variants, 'Red', 'M')?.id, 2);
  assert.equal(resolveVariant(variants, 'Black', 'M')?.id, 1);
});

test('only variants accepted by the order quote are selectable', () => {
  const variants = [variant(1, 'Black', 'M'), variant(2, 'Red', 'L', 0), { ...variant(3, 'Blue', 'S'), id: undefined }];
  assert.deepEqual(orderableVariants(variants).map((entry) => entry.id), [1]);
  assert.equal(resolveVariant([], 'Red', 'L'), undefined);
});

test('empty color and size remain distinct selectable combinations', () => {
  const variants = [variant(1, '', ''), variant(2, '', 'L'), variant(3, 'Red', 'L')];
  assert.equal(resolveVariant(variants, '', '')?.id, 1);
  assert.equal(resolveVariant(variants, '', 'L')?.id, 2);
  assert.equal(resolveVariant(variants, 'Red', 'L')?.id, 3);
});
