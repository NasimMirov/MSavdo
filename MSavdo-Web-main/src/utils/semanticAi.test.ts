import assert from 'node:assert/strict';
import test from 'node:test';
import { extractStructuredFromHtmlOrJson, isLikelyProductTitle } from './semanticAi.js';

test('prefers the product subject over a seller company title', () => {
  const parsed = extractStructuredFromHtmlOrJson(`window.context = {
    "company": { "title": "ACME Company Limited" },
    "data": {
      "offerDetail": {
        "subject": "Мужская хлопковая футболка",
        "featureAttributes": [{ "name": "Материал", "value": "Хлопок" }],
        "skuInfoMap": {
          "Черный M": { "price": "12.5", "canBookCount": 8, "skuId": "sku-1" }
        }
      }
    }
  };`);

  assert.equal(parsed.title, 'Мужская хлопковая футболка');
  assert.equal(parsed.variants.length, 1);
  assert.equal(parsed.variants[0].price_cny, 12.5);
  assert.equal(parsed.variants[0].stock, 8);
});

test('prefers the product h1 over the company page title', () => {
  const parsed = extractStructuredFromHtmlOrJson(
    '<title>ACME Company Limited</title><h1>Умный датчик температуры</h1>',
  );

  assert.equal(parsed.title, 'Умный датчик температуры');
});

test('extracts the source product category from structured marketplace data', () => {
  const parsed = extractStructuredFromHtmlOrJson(`window.context = {
    "company": { "categoryName": "Женская одежда" },
    "data": {
      "offerDetail": {
        "subject": "Понижающий DC-DC преобразователь",
        "categoryName": "Источники питания и DC-DC модули"
      }
    }
  };`);

  assert.equal(parsed.categoryHint, 'Источники питания и DC-DC модули');
});

test('rejects company names as product titles', () => {
  assert.equal(isLikelyProductTitle('ACME Company Limited'), false);
  assert.equal(isLikelyProductTitle('Мужская хлопковая футболка'), true);
});
