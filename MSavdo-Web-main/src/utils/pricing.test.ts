import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calculateManualVariantPrice, calculatePriceTjs } from './pricing';

test('manual variant pricing uses confirmed tiers before delivery', () => {
  assert.deepEqual(calculateManualVariantPrice(100, 0.5, null), {
    priceTjs: 210, markupPercent: 30, shippingTjs: 15,
  });
  assert.equal(calculateManualVariantPrice(133.34, 1, null)?.markupPercent, 20);
  assert.equal(calculateManualVariantPrice(1333.34, 1, null)?.markupPercent, 10);
  assert.equal(calculateManualVariantPrice(1333, 1, null)?.markupPercent, 20);
});

test('manual pricing always calculates delivery from the entered weight', () => {
  assert.deepEqual(calculateManualVariantPrice(32, 105, null), {
    priceTjs: 3212, markupPercent: 30, shippingTjs: 3150,
  });
  assert.equal(calculateManualVariantPrice(32, 1, null)?.priceTjs, 92);
  assert.deepEqual(calculateManualVariantPrice(100, 5, 50), {
    priceTjs: 375, markupPercent: 50, shippingTjs: 150,
  });
  assert.equal(calculateManualVariantPrice(100, 1, 0)?.priceTjs, 180);
});

test('import pricing retains its existing volume-based delivery', () => {
  assert.equal(calculatePriceTjs(100, 5, 0.1), 345);
  assert.equal(calculatePriceTjs(100, 5, 0), 295);
});

test('manual pricing rejects invalid and unsafe inputs', () => {
  assert.equal(calculateManualVariantPrice(0, 1, null), null);
  assert.equal(calculateManualVariantPrice(100, 0, null), null);
  assert.equal(calculateManualVariantPrice(100, 1, -1), null);
  assert.equal(calculateManualVariantPrice(100, 1, 1001), null);
  assert.equal(calculateManualVariantPrice(Number.MAX_VALUE, 1, null), null);
});
