const CACHE_KEY = 'msavdo_initial_catalog_v1';
const CACHE_MAX_AGE_MS = 15 * 60 * 1000;

export interface InitialCatalogSnapshot<T> {
  products: T[];
  total: number;
  has_more: boolean;
  delivery_counts?: { all: number; order: number; stock: number };
}

interface CatalogCacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredCatalog<T> {
  saved_at: number;
  catalog: InitialCatalogSnapshot<T>;
}

export function readInitialCatalogCache<T>(
  storage?: CatalogCacheStorage,
  now = Date.now(),
): InitialCatalogSnapshot<T> | null {
  try {
    const target = storage ?? window.localStorage;
    const raw = target.getItem(CACHE_KEY);
    if (!raw) return null;

    const stored = JSON.parse(raw) as StoredCatalog<T>;
    const age = now - stored.saved_at;
    const catalog = stored.catalog;
    if (
      !Number.isFinite(stored.saved_at) ||
      age < 0 ||
      age > CACHE_MAX_AGE_MS ||
      !Array.isArray(catalog?.products) ||
      !Number.isFinite(catalog.total) ||
      typeof catalog.has_more !== 'boolean'
    ) {
      return null;
    }

    return catalog;
  } catch (error) {
    console.warn('[Catalog Cache] Не удалось прочитать сохранённый каталог:', error);
    return null;
  }
}

export function writeInitialCatalogCache<T>(
  catalog: InitialCatalogSnapshot<T>,
  storage?: CatalogCacheStorage,
  now = Date.now(),
): void {
  try {
    const target = storage ?? window.localStorage;
    target.setItem(CACHE_KEY, JSON.stringify({ saved_at: now, catalog } satisfies StoredCatalog<T>));
  } catch (error) {
    console.warn('[Catalog Cache] Не удалось сохранить каталог:', error);
  }
}
