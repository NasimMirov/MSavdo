import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeSemantically, extractStructuredFromHtmlOrJson, isLikelyProductTitle } from './semanticAi.js';

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

test('extracts the source category and Google manufacturer fields', () => {
  const parsed = extractStructuredFromHtmlOrJson(`window.context = {
    "company": { "categoryName": "Женская одежда" },
    "data": {
      "offerDetail": {
        "subject": "Понижающий DC-DC преобразователь",
        "categoryName": "Источники питания и DC-DC модули",
        "brand": "Xiaomi",
        "manufacturer": "Xiaomi Technology",
        "gtin": "4006381333931",
        "mpn": "MDY-11-EZ"
      }
    }
  };`);

  assert.equal(parsed.categoryHint, 'Источники питания и DC-DC модули');
  assert.equal(parsed.brand, 'Xiaomi');
  assert.equal(parsed.manufacturer, 'Xiaomi Technology');
  assert.equal(parsed.gtin, '4006381333931');
  assert.equal(parsed.mpn, 'MDY-11-EZ');
});

test('extracts Google manufacturer fields from translated specifications', () => {
  const parsed = extractStructuredFromHtmlOrJson(`window.context = {
    "data": {
      "subject": "Товар",
      "featureAttributes": [
        { "name": "Бренд", "value": "Xiaomi" },
        { "name": "Производитель", "value": "Xiaomi Technology" },
        { "name": "EAN", "value": "4006381333931" },
        { "name": "Номер модели", "value": "MDY-11-EZ" }
      ]
    }
  };`);

  assert.equal(parsed.brand, 'Xiaomi');
  assert.equal(parsed.manufacturer, 'Xiaomi Technology');
  assert.equal(parsed.gtin, '4006381333931');
  assert.equal(parsed.mpn, 'MDY-11-EZ');
});

test('extracts Google manufacturer fields from Chinese-labeled specifications', () => {
  const parsed = extractStructuredFromHtmlOrJson(`window.context = {
    "data": {
      "subject": "Товар",
      "featureAttributes": [
        { "name": "品牌", "value": "Xiaomi" },
        { "name": "厂家", "value": "Xiaomi Technology" },
        { "name": "条形码", "value": "4006381333931" },
        { "name": "型号", "value": "MDY-11-EZ" }
      ]
    }
  };`);

  assert.equal(parsed.brand, 'Xiaomi');
  assert.equal(parsed.manufacturer, 'Xiaomi Technology');
  assert.equal(parsed.gtin, '4006381333931');
  assert.equal(parsed.mpn, 'MDY-11-EZ');
});

test('rejects company names as product titles', () => {
  assert.equal(isLikelyProductTitle('ACME Company Limited'), false);
  assert.equal(isLikelyProductTitle('Мужская хлопковая футболка'), true);
});

test('preserves untranslated Chinese titles instead of replacing them with a generic product', () => {
  const title = '精密螺旋千分测量仪';
  assert.equal(analyzeSemantically('', title).title, title);
});
