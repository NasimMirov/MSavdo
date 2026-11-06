import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeImportVariants } from './importVariants.js';

test('preserves every source SKU and its identity regardless of category', () => {
  const source = Array.from({ length: 600 }, (_, index) => ({
    color: `Модификация ${index}`,
    size: 'Стандарт',
    sku_id: `sku-${index}`,
    weight_kg: index === 0 ? 2 : 0,
  }));
  const result = normalizeImportVariants([{ color: 'other', size: '', sku_id: '', weight_kg: 0 }], source, 0.5);
  assert.equal(result.length, 600);
  assert.deepEqual(result.map((variant) => variant.sku_id), source.map((variant) => variant.sku_id));
  assert.equal(result[0].weight_kg, 2);
  assert.equal(result[1].weight_kg, 0.5);
});

test('uses extracted variants when structured SKU data is absent', () => {
  const variants = [{ color: 'Красный', weight_kg: 0 }];
  assert.deepEqual(normalizeImportVariants(variants, [], 0.75), [{ color: 'Красный', weight_kg: 0.75 }]);
});
