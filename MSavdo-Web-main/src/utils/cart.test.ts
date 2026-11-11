import assert from 'node:assert/strict';
import test from 'node:test';
import type { CartItem } from '../types';
import { addCartItem, mergeCartItems, MAX_CART_QUANTITY } from './cart';

const item: CartItem = {
  id: 'old', product_id: 1, variant_id: 10, variant_sku: 'sku', base_sku: 'base',
  title: 'Product', color: 'Black', size: 'M', price_tjs: 100, image: '',
  quantity: 1, stock: 0,
};

test('legacy cart entries with different ids for the same variant merge without losing quantity', () => {
  const merged = mergeCartItems([item, { ...item, id: 'new', quantity: 2 }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].quantity, 3);
  assert.equal(merged[0].id, 'old');
});

test('different variants remain separate and adding the same variant combines quantities', () => {
  const other = { ...item, id: 'other', variant_id: 11 };
  const cart = addCartItem([item, other], { ...item, id: 'new', quantity: 2 });
  assert.deepEqual(cart?.map((entry) => entry.quantity), [3, 1]);
});

test('server quantity and line limits are not exceeded by additions', () => {
  assert.equal(addCartItem([{ ...item, quantity: MAX_CART_QUANTITY }], item), null);
  const full = Array.from({ length: 200 }, (_, index) => ({ ...item, id: String(index), variant_id: index + 1 }));
  assert.equal(addCartItem(full, { ...item, variant_id: 300 }), null);
});
