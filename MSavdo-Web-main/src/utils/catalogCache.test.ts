import assert from 'node:assert/strict';
import test from 'node:test';
import { readInitialCatalogCache, writeInitialCatalogCache } from './catalogCache.ts';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

test('initial catalog cache round-trips the public catalog response', () => {
  const storage = createStorage();
  const catalog = {
    products: [{ id: 1, title: 'Товар' }],
    total: 1,
    has_more: false,
    delivery_counts: { all: 1, order: 0, stock: 1 },
  };

  writeInitialCatalogCache(catalog, storage, 1000);

  assert.deepEqual(readInitialCatalogCache(storage, 2000), catalog);
});

test('expired or invalid catalog snapshots are ignored', () => {
  const storage = createStorage();
  writeInitialCatalogCache({ products: [], total: 0, has_more: false }, storage, 1000);
  assert.equal(readInitialCatalogCache(storage, 901_001), null);

  storage.setItem('msavdo_initial_catalog_v1', '{invalid');
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(readInitialCatalogCache(storage, 2000), null);
  } finally {
    console.warn = originalWarn;
  }
});

test('unavailable storage does not prevent catalog loading', () => {
  const storage = {
    getItem: () => { throw new Error('Storage unavailable'); },
    setItem: () => { throw new Error('Storage unavailable'); },
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(readInitialCatalogCache(storage), null);
    assert.doesNotThrow(() => writeInitialCatalogCache({ products: [], total: 0, has_more: false }, storage));
  } finally {
    console.warn = originalWarn;
  }
});
