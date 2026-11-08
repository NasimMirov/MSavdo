import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SNAPSHOT_ID = '2026-11-04';
const SNAPSHOT_SHA256 = '913134c2a1f5860baa15e00b8e07d77a6cb9a31f67900ac18767e794a4c1cbe1';
const RESTORE_SETTING_KEY = `catalog_snapshot_restore_${SNAPSHOT_ID}`;
const DEMO_PRODUCTS = new Map([
  [1, 'Мужские защитные дышащие кроссовки Hyper-Breeze'],
  [2, 'Оверсайз худи Heavy Cotton 450г/м² с мягким начесом'],
  [3, 'Смарт-часы Titanium Series Ultra AMOLED'],
  [4, 'Беспроводные наушники Clarity ANC Pro с пространственным аудио'],
]);

type DatabaseValue = string | number | bigint | null;
type DatabaseRow = Record<string, DatabaseValue>;

export interface CatalogSnapshotRestoreResult {
  restored: boolean;
  reason?: string;
  productsImported?: number;
  variantsImported?: number;
  backupPath?: string;
}

function getColumns(db: DatabaseSync, table: string): Set<string> {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
      .map((column) => column.name),
  );
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Недопустимое имя колонки базы данных: ${identifier}`);
  }
  return `"${identifier}"`;
}

export function restoreCatalogSnapshot(
  db: DatabaseSync,
  dbPath: string,
  snapshotPath: string,
): CatalogSnapshotRestoreResult {
  if (!fs.existsSync(snapshotPath)) {
    return { restored: false, reason: 'snapshot-not-found' };
  }

  const snapshotHash = crypto.createHash('sha256').update(fs.readFileSync(snapshotPath)).digest('hex');
  if (snapshotHash !== SNAPSHOT_SHA256) {
    return { restored: false, reason: 'snapshot-hash-mismatch' };
  }

  const restoredMarker = db.prepare('SELECT value FROM settings WHERE key = ?')
    .get(RESTORE_SETTING_KEY) as { value: string } | undefined;
  if (restoredMarker) {
    return { restored: false, reason: 'already-restored' };
  }

  const snapshot = new DatabaseSync(snapshotPath, { readOnly: true });
  try {
    const snapshotProducts = snapshot.prepare('SELECT * FROM products ORDER BY id').all() as DatabaseRow[];
    const snapshotDemoProducts = snapshotProducts.filter((product) => DEMO_PRODUCTS.has(Number(product.id)));
    const productsToRestore = snapshotProducts.filter((product) => !DEMO_PRODUCTS.has(Number(product.id)));
    const variantsToRestore = snapshot.prepare(`
      SELECT * FROM product_variants
      WHERE product_id NOT IN (${Array.from(DEMO_PRODUCTS.keys()).join(',')})
      ORDER BY id
    `).all() as DatabaseRow[];
    const snapshotDemoVariants = snapshot.prepare(`
      SELECT COUNT(*) AS count FROM product_variants
      WHERE product_id IN (${Array.from(DEMO_PRODUCTS.keys()).join(',')})
    `).get() as { count: number };

    if (
      snapshotProducts.length !== 21
      || snapshotDemoProducts.length !== DEMO_PRODUCTS.size
      || productsToRestore.length !== 17
      || variantsToRestore.length !== 93
      || snapshotDemoVariants.count !== 35
      || snapshotProducts.some((product) => product.status !== 'active')
      || snapshotDemoProducts.some((product) => DEMO_PRODUCTS.get(Number(product.id)) !== product.title)
    ) {
      return { restored: false, reason: 'snapshot-content-mismatch' };
    }

    const existingProducts = db.prepare('SELECT id, title, status FROM products ORDER BY id').all() as Array<{
      id: number;
      title: string;
      status: string;
    }>;
    const expectedDemoRows = Array.from(DEMO_PRODUCTS, ([id, title]) => ({ id, title }));
    if (
      existingProducts.length !== expectedDemoRows.length
      || expectedDemoRows.some((expected) => {
        const actual = existingProducts.find((product) => product.id === expected.id);
        return !actual || actual.title !== expected.title || actual.status !== 'active';
      })
    ) {
      return { restored: false, reason: 'live-database-does-not-match-empty-seed' };
    }

    const existingVariantIds = db.prepare('SELECT id FROM product_variants').all() as Array<{ id: number }>;
    if (
      existingVariantIds.length !== snapshotDemoVariants.count
      || existingVariantIds.some((variant) => variant.id < 1 || variant.id > 35)
    ) {
      return { restored: false, reason: 'live-variant-data-does-not-match-empty-seed' };
    }

    for (const product of productsToRestore) {
      const byId = db.prepare('SELECT 1 FROM products WHERE id = ?').get(product.id);
      const bySku = db.prepare('SELECT 1 FROM products WHERE base_sku = ?').get(product.base_sku);
      if (byId || bySku) {
        return { restored: false, reason: 'product-id-or-sku-conflict' };
      }
    }
    for (const variant of variantsToRestore) {
      const byId = db.prepare('SELECT 1 FROM product_variants WHERE id = ?').get(variant.id);
      const bySku = db.prepare('SELECT 1 FROM product_variants WHERE variant_sku = ?').get(variant.variant_sku);
      if (byId || bySku) {
        return { restored: false, reason: 'variant-id-or-sku-conflict' };
      }
    }

    const backupPath = `${dbPath}.before-catalog-restore-${SNAPSHOT_ID}-${Date.now()}.bak`;
    db.prepare('VACUUM INTO ?').run(backupPath);

    const sourceCategories = snapshot.prepare('SELECT id, name, parent_id FROM categories ORDER BY id')
      .all() as Array<{ id: number; name: string; parent_id: number | null }>;
    const categoryIds = new Map<number, number>();
    const pendingCategories = [...sourceCategories];
    const findCategory = db.prepare('SELECT id FROM categories WHERE name = ?');
    const insertCategory = db.prepare('INSERT INTO categories (name, parent_id) VALUES (?, ?)');

    const sourceProductColumns = getColumns(snapshot, 'products');
    const targetProductColumns = getColumns(db, 'products');
    const productColumns = [...sourceProductColumns].filter((column) => targetProductColumns.has(column));
    const sourceVariantColumns = getColumns(snapshot, 'product_variants');
    const targetVariantColumns = getColumns(db, 'product_variants');
    const variantColumns = [...sourceVariantColumns].filter((column) => targetVariantColumns.has(column));
    if (
      !['id', 'category_id', 'title', 'base_sku', 'status'].every((column) => productColumns.includes(column))
      || !['id', 'product_id', 'variant_sku'].every((column) => variantColumns.includes(column))
    ) {
      throw new Error('В таблицах базы не хватает колонок для восстановления каталога');
    }

    const insertProduct = db.prepare(
      `INSERT INTO products (${productColumns.map(quoteIdentifier).join(', ')}) `
      + `VALUES (${productColumns.map(() => '?').join(', ')})`,
    );
    const insertVariant = db.prepare(
      `INSERT INTO product_variants (${variantColumns.map(quoteIdentifier).join(', ')}) `
      + `VALUES (${variantColumns.map(() => '?').join(', ')})`,
    );

    db.exec('BEGIN IMMEDIATE');
    try {
      while (pendingCategories.length > 0) {
        let insertedOrMapped = 0;
        for (let index = pendingCategories.length - 1; index >= 0; index -= 1) {
          const category = pendingCategories[index];
          const existing = findCategory.get(category.name) as { id: number } | undefined;
          if (existing) {
            categoryIds.set(category.id, existing.id);
            pendingCategories.splice(index, 1);
            insertedOrMapped += 1;
            continue;
          }
          if (category.parent_id !== null && !categoryIds.has(category.parent_id)) continue;
          const parentId = category.parent_id === null ? null : categoryIds.get(category.parent_id)!;
          const inserted = insertCategory.run(category.name, parentId);
          categoryIds.set(category.id, Number(inserted.lastInsertRowid));
          pendingCategories.splice(index, 1);
          insertedOrMapped += 1;
        }
        if (insertedOrMapped === 0) {
          throw new Error('Не удалось сопоставить родительские категории снимка');
        }
      }

      for (const product of productsToRestore) {
        const values = productColumns.map((column) => {
          if (column === 'category_id' && product.category_id !== null) {
            const categoryId = categoryIds.get(Number(product.category_id));
            if (categoryId === undefined) {
              throw new Error(`Не найдена категория для товара ${product.id}`);
            }
            return categoryId;
          }
          return product[column];
        });
        insertProduct.run(...values);
      }

      for (const variant of variantsToRestore) {
        insertVariant.run(...variantColumns.map((column) => variant[column]));
      }

      db.prepare(`
        UPDATE products
        SET status = 'draft'
        WHERE id IN (${Array.from(DEMO_PRODUCTS.keys()).join(',')})
      `).run();
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
        .run(RESTORE_SETTING_KEY, JSON.stringify({
          snapshotHash,
          productsImported: productsToRestore.length,
          variantsImported: variantsToRestore.length,
          backupPath,
        }));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    return {
      restored: true,
      productsImported: productsToRestore.length,
      variantsImported: variantsToRestore.length,
      backupPath,
    };
  } finally {
    snapshot.close();
  }
}
