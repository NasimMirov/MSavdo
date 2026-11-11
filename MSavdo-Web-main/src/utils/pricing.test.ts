import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calculateManualVariantPrice } from './pricing';

test('manual variant pricing uses confirmed tiers before delivery', () => {
  assert.deepEqual(calculateManualVariantPrice(100, 0.5, 0, null), {
    priceTjs: 210, markupPercent: 30, shippingTjs: 15, usesVolume: false,
  });
  assert.equal(calculateManualVariantPrice(133.34, 1, 0, null)?.markupPercent, 20);
  assert.equal(calculateManualVariantPrice(1333.34, 1, 0, null)?.markupPercent, 10);
  assert.equal(calculateManualVariantPrice(1333, 1, 0, null)?.markupPercent, 20);
});

test('manual markup and volume override the automatic tier and weight delivery', () => {
  assert.deepEqual(calculateManualVariantPrice(100, 5, 0.1, 50), {
    priceTjs: 425, markupPercent: 50, shippingTjs: 200, usesVolume: true,
  });
  assert.equal(calculateManualVariantPrice(100, 1, 0, 0)?.priceTjs, 180);
});

test('manual pricing rejects invalid and unsafe inputs', () => {
  assert.equal(calculateManualVariantPrice(0, 1, 0, null), null);
  assert.equal(calculateManualVariantPrice(100, 0, 0, null), null);
  assert.equal(calculateManualVariantPrice(100, 1, 0, -1), null);
  assert.equal(calculateManualVariantPrice(100, 1, 0, 1001), null);
  assert.equal(calculateManualVariantPrice(Number.MAX_VALUE, 1, 0, null), null);
});
