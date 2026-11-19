import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBilingualProductDescription, ensureOrderDeliveryNotice, extractProductColors, removeOrderDeliveryNotice, removeProductColor } from './productDescription.ts';

test('normalizes old and current delivery notices without duplicating them', () => {
  for (const notice of ['Доставка 18-30 дней!', 'Доставка 18–20 дней!', 'Доставка до 30 дней!', 'Доставка 12–35 дней!']) {
    const description = `${notice}\n\nОписание товара`;
    assert.equal(ensureOrderDeliveryNotice(description), 'Доставка 12–35 дней!\n\nОписание товара');
    assert.equal(removeOrderDeliveryNotice(description), 'Описание товара');
  }
  assert.equal(ensureOrderDeliveryNotice(''), 'Доставка 12–35 дней!');
  assert.equal(removeOrderDeliveryNotice('Другие условия доставки'), 'Другие условия доставки');
});

test('builds imported descriptions with Tajik first and keeps the Russian block clean', () => {
  const messyDescription = 'Водомет высокого давления с длинной ручкой, предназначенный барои домашней мойки автомобилей. мавод барои головки пистолета: Металл + Пластик / мавод рукоятки / пластик. Технические характеристики и модели: Длинноствольное ружье Т8 + отдельный контейнер с пеной: 0 / Длинное копье Т8.';
  const result = buildBilingualProductDescription(
    messyDescription,
    'Водяной пистолет высокого давления',
    [
      { name: 'Материал', value: 'Металл + Пластик' },
      { name: 'Расстояние распыления', value: '10 м' },
      { name: 'Вес', value: '0.3 кг' },
    ],
  );
  assert.ok(result.startsWith('Дар анбор мавҷуд нест.'));
  assert.ok(result.indexOf('Тавсифи маҳсулот:') < result.indexOf('Характеристики:'));
  assert.ok(!result.includes('предназначенный барои'));
  assert.ok(!result.includes('Технические характеристики и модели'));
  assert.ok(!result.includes('Длинноствольное ружье Т8'));
});

test('removing a product color removes it from all color sources and preserves other values', () => {
  const specifications = [
    { name: '颜色分类', value: 'Синий [旧款], Очки G1R2 без оправы' },
    { name: 'Фото цвета: Синий', value: 'https://example.test/blue.jpg' },
    { name: 'Фото цвета: Очки G1R2 без оправы', value: 'https://example.test/glasses.jpg' },
    { name: 'Материал', value: 'Пластик' },
  ];
  const description = 'Доступные цвета: Синий [旧款], Очки G1R2 без оправы\nМатериал: Пластик';

  const { specifications: updatedSpecifications, description: updatedDescription } = removeProductColor(
    specifications,
    description,
    'Синий',
  );

  assert.deepEqual(extractProductColors(updatedSpecifications, updatedDescription), ['Очки G1R2 без оправы']);
  assert.deepEqual(updatedSpecifications, [
    { name: '颜色分类', value: 'Очки G1R2 без оправы' },
    { name: 'Фото цвета: Очки G1R2 без оправы', value: 'https://example.test/glasses.jpg' },
    { name: 'Материал', value: 'Пластик' },
  ]);
  assert.equal(updatedDescription, 'Доступные цвета: Очки G1R2 без оправы\nМатериал: Пластик');
});

test('removing the final color removes empty color labels and related image metadata', () => {
  const result = removeProductColor(
    [
      { name: 'Цвет', value: 'Черный' },
      { name: 'Фото цвета: Черный', value: 'https://example.test/black.jpg' },
    ],
    'Цвета: Черный',
    'черный',
  );

  assert.deepEqual(result, { specifications: [], description: '' });
});
