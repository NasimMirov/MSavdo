import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { restoreCatalogSnapshot } from './catalogSnapshotRestore.js';

const snapshotPath = fileURLToPath(new URL('../../msavdo.db', import.meta.url));
const temporaryDirectories: string[] = [];

function createLiveDatabase(): { db: DatabaseSync; dbPath: string } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'msavdo-catalog-restore-'));
  temporaryDirectories.push(directory);
  const dbPath = path.join(directory, 'msavdo.db');
  const db = new DatabaseSync(dbPath);
  const snapshot = new DatabaseSync(snapshotPath, { readOnly: true });

  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      parent_id INTEGER,
      FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
    );
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      original_link TEXT,
      category_id INTEGER,
      base_sku TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'active',
      delivery_type TEXT DEFAULT 'order',
      main_image TEXT,
      images TEXT,
      video_url TEXT,
      video_urls TEXT,
      youtube_url TEXT,
      specifications TEXT,
      views_count INTEGER DEFAULT 0,
      video_first INTEGER DEFAULT 0,
      discount_percent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );
    CREATE TABLE product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      color TEXT,
      size TEXT,
      price_cny REAL NOT NULL,
      price_tjs INTEGER NOT NULL,
      stock INTEGER DEFAULT 10,
      weight_kg REAL DEFAULT 0.5,
      volume_m3 REAL NOT NULL DEFAULT 0,
      variant_sku TEXT UNIQUE NOT NULL,
      image_url TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      total_amount REAL NOT NULL,
      items_json TEXT NOT NULL
    );
    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      variant_id INTEGER,
      title TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      price_tjs REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
  `);

  const sourceCategories = snapshot.prepare('SELECT id, name, parent_id FROM categories').all() as Array<{
    id: number;
    name: string;
    parent_id: number | null;
  }>;
  const insertCategory = db.prepare('INSERT INTO categories (id, name, parent_id) VALUES (?, ?, ?)');
  const pendingCategories = [...sourceCategories];
  const insertedCategoryIds = new Set<number>();
  while (pendingCategories.length > 0) {
    let inserted = 0;
    for (let index = pendingCategories.length - 1; index >= 0; index -= 1) {
      const category = pendingCategories[index];
      if (category.parent_id !== null && !insertedCategoryIds.has(category.parent_id)) continue;
      insertCategory.run(category.id, category.name, category.parent_id);
      insertedCategoryIds.add(category.id);
      pendingCategories.splice(index, 1);
      inserted += 1;
    }
    assert.ok(inserted > 0, 'Snapshot categories should not contain a missing parent or a cycle');
  }

  const sourceProducts = snapshot.prepare('SELECT * FROM products WHERE id BETWEEN 1 AND 4 ORDER BY id').all() as Array<
    Record<string, string | number | bigint | null>
  >;
  const productColumns = [
    'id', 'title', 'description', 'original_link', 'category_id', 'base_sku', 'status',
    'main_image', 'created_at', 'images', 'video_url', 'delivery_type', 'youtube_url',
    'specifications', 'views_count', 'video_urls',
  ];
  const insertProduct = db.prepare(
    `INSERT INTO products (${productColumns.join(', ')}) VALUES (${productColumns.map(() => '?').join(', ')})`,
  );
  for (const product of sourceProducts) {
    insertProduct.run(...productColumns.map((column) => (
      column === 'base_sku' ? `live-${product.id}` : product[column]
    )));
  }

  const sourceVariants = snapshot.prepare('SELECT * FROM product_variants WHERE product_id BETWEEN 1 AND 4 ORDER BY id').all() as Array<
    Record<string, string | number | bigint | null>
  >;
  const variantColumns = [
    'id', 'product_id', 'color', 'size', 'price_cny', 'price_tjs',
    'stock', 'weight_kg', 'variant_sku', 'image_url', 'volume_m3',
  ];
  const insertVariant = db.prepare(
    `INSERT INTO product_variants (${variantColumns.join(', ')}) VALUES (${variantColumns.map(() => '?').join(', ')})`,
  );
  for (const variant of sourceVariants) {
    insertVariant.run(...variantColumns.map((column) => (
      column === 'variant_sku' ? `live-${variant.id}` : variant[column]
    )));
  }

  db.prepare('INSERT INTO orders (order_number, total_amount, items_json) VALUES (?, ?, ?)')
    .run('KEEP-ORDER', 10, '[]');
  db.prepare(`
    INSERT INTO order_items (order_id, product_id, variant_id, title, quantity, price_tjs)
    VALUES (1, 5, 36, 'Previously missing product', 1, 10)
  `).run();
  snapshot.close();
  return { db, dbPath };
}

function addMatchingDraftFromSnapshot(db: DatabaseSync, productId: number): void {
  const snapshot = new DatabaseSync(snapshotPath, { readOnly: true });
  try {
    const product = snapshot.prepare('SELECT * FROM products WHERE id = ?').get(productId) as
      | Record<string, string | number | bigint | null>
      | undefined;
    assert.ok(product);
    const productColumns = [
      'id', 'title', 'description', 'original_link', 'category_id', 'base_sku', 'status',
      'main_image', 'created_at', 'images', 'video_url', 'delivery_type', 'youtube_url',
      'specifications', 'views_count', 'video_urls',
    ];
    const insertProduct = db.prepare(
      `INSERT INTO products (${productColumns.join(', ')}) VALUES (${productColumns.map(() => '?').join(', ')})`,
    );
    insertProduct.run(...productColumns.map((column) => (
      column === 'status' ? 'draft' : product[column]
    )));

    const variants = snapshot.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY id').all(productId) as Array<
      Record<string, string | number | bigint | null>
    >;
    const variantColumns = [
      'id', 'product_id', 'color', 'size', 'price_cny', 'price_tjs',
      'stock', 'weight_kg', 'variant_sku', 'image_url', 'volume_m3',
    ];
    const insertVariant = db.prepare(
      `INSERT INTO product_variants (${variantColumns.join(', ')}) VALUES (${variantColumns.map(() => '?').join(', ')})`,
    );
    for (const variant of variants) {
      insertVariant.run(...variantColumns.map((column) => variant[column]));
    }
  } finally {
    snapshot.close();
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('backs up the current database, restores imported products, and preserves orders', () => {
  const { db, dbPath } = createLiveDatabase();
  try {
    addMatchingDraftFromSnapshot(db, 5);
    const result = restoreCatalogSnapshot(db, dbPath, snapshotPath);

    assert.equal(result.restored, true);
    assert.equal(result.productsImported, 16);
    assert.equal(result.productsActivated, 1);
    assert.equal(result.variantsImported, 91);
    assert.ok(result.backupPath && fs.existsSync(result.backupPath));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM products').get()?.count, 21);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM products WHERE status = 'active'").get()?.count, 17);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM products WHERE status = 'draft'").get()?.count, 4);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM product_variants').get()?.count, 128);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders').get()?.count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM order_items').get()?.count, 1);
    assert.equal(db.prepare('SELECT 1 FROM products WHERE id = 5').get() !== undefined, true);
    assert.equal(db.prepare('SELECT 1 FROM product_variants WHERE id = 36').get() !== undefined, true);

    const backup = new DatabaseSync(result.backupPath!, { readOnly: true });
    assert.equal(backup.prepare('SELECT COUNT(*) AS count FROM products').get()?.count, 5);
    assert.equal(backup.prepare('SELECT COUNT(*) AS count FROM orders').get()?.count, 1);
    backup.close();

    const repeat = restoreCatalogSnapshot(db, dbPath, snapshotPath);
    assert.equal(repeat.restored, false);
    assert.equal(repeat.reason, 'already-restored');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM products').get()?.count, 21);
  } finally {
    db.close();
  }
});

test('does not alter a database that contains products beyond the four startup samples', () => {
  const { db, dbPath } = createLiveDatabase();
  try {
    db.prepare(`
      INSERT INTO products (title, base_sku, status)
      VALUES ('Additional live product', 'LIVE-EXTRA', 'active')
    `).run();

    const result = restoreCatalogSnapshot(db, dbPath, snapshotPath);

    assert.equal(result.restored, false);
    assert.equal(result.reason, 'live-product-data-conflict');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM products').get()?.count, 5);
    assert.equal(fs.readdirSync(path.dirname(dbPath)).some((name) => name.endsWith('.bak')), false);
  } finally {
    db.close();
  }
});

test('checks the exact committed snapshot before migrating', () => {
  const snapshotHash = crypto.createHash('sha256').update(fs.readFileSync(snapshotPath)).digest('hex');
  assert.equal(snapshotHash, '913134c2a1f5860baa15e00b8e07d77a6cb9a31f67900ac18767e794a4c1cbe1');
});
