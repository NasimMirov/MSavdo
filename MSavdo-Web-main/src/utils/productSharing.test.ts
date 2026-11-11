import assert from 'node:assert/strict';
import test from 'node:test';
import type { Product } from '../types.ts';
import { copyProductLink, getProductUrl, shareProduct } from './productSharing.ts';

test('shares, copies, and reports clipboard failures without leaving temporary elements', async () => {
  const product: Product = {
    id: 12, title: 'Умные очки', description: '', category_id: null,
    base_sku: 'TEST', status: 'active', main_image: '',
  };
  const keys = ['window', 'navigator', 'document'] as const;
  const descriptors = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const setGlobal = (name: typeof keys[number], value: object) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });

  try {
    setGlobal('window', { location: { origin: 'https://msavdo.shop' } });
    const url = getProductUrl(product);
    assert.match(decodeURI(url), /\/product\/12\/умные-очки$/);
    let copied = '';
    setGlobal('navigator', { clipboard: { writeText: async (value: string) => { copied = value; } } });
    assert.equal(await shareProduct(product), 'copied');
    assert.equal(copied, url);

    setGlobal('navigator', { share: async () => { throw new DOMException('cancelled', 'AbortError'); } });
    assert.equal(await shareProduct(product), 'cancelled');

    let removed = 0;
    let succeed = true;
    setGlobal('navigator', {});
    setGlobal('document', {
      createElement: () => ({
        value: '', style: {}, setAttribute() {}, select() {}, remove() { removed++; },
      }),
      body: { appendChild() {} },
      execCommand: () => succeed,
    });
    await copyProductLink(product);
    assert.equal(removed, 1);
    succeed = false;
    await assert.rejects(copyProductLink(product), /Не удалось скопировать/);
    assert.equal(removed, 2);
  } finally {
    for (const key of keys) {
      const descriptor = descriptors.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
