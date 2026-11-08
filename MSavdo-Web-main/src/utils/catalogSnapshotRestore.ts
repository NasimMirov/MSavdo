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
  details?: string;
  productsImported?: number;
  productsActivated?: number;
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
    const snapshotProductIds = snapshotProducts.map((product) => Number(product.id));
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

    const existingProducts = db.prepare('SELECT id, title, original_link, base_sku, status FROM products ORDER BY id').all() as Array<{
      id: number;
      title: string;
      original_link: string | null;
      base_sku: string;
      status: string;
    }>;
    const expectedDemoRows = Array.from(DEMO_PRODUCTS, ([id, title]) => ({ id, title }));
    const productsById = new Map(snapshotProducts.map((product) => [Number(product.id), product]));
    const existingProductsById = new Map(existingProducts.map((product) => [product.id, product]));
    const productsToActivate: number[] = [];
    for (const expected of expectedDemoRows) {
      const actual = existingProductsById.get(expected.id);
      if (!actual || actual.title !== expected.title || actual.status !== 'active') {
        return { restored: false, reason: 'live-database-does-not-match-startup-samples' };
      }
    }

    for (const product of existingProducts) {
      if (DEMO_PRODUCTS.has(product.id)) continue;
      const snapshotProduct = productsById.get(product.id);
      if (
        snapshotProduct
        && snapshotProduct.title === product.title
        && snapshotProduct.original_link === product.original_link
        && snapshotProduct.base_sku === product.base_sku
        && (product.status === 'active' || product.status === 'draft')
      ) {
        if (product.status === 'draft' && snapshotProduct.status === 'active') {
          productsToActivate.push(product.id);
        }
        continue;
      }
      if (product.id > Math.max(...snapshotProductIds) && product.status === 'draft') continue;
      const conflictingFields = snapshotProduct
        ? [
          snapshotProduct.title !== product.title ? 'title' : null,
          snapshotProduct.original_link !== product.original_link ? 'original_link' : null,
          snapshotProduct.base_sku !== product.base_sku ? 'base_sku' : null,
          product.status !== 'active' && product.status !== 'draft' ? 'status' : null,
        ].filter((field): field is string => field !== null)
        : ['not-in-snapshot'];
      return {
        restored: false,
        reason: 'live-product-data-conflict',
        details: `product-id=${product.id}; fields=${conflictingFields.join(',')}`,
      };
    }

    const existingVariants = db.prepare('SELECT id, product_id, variant_sku FROM product_variants ORDER BY id').all() as Array<{
      id: number;
      product_id: number;
      variant_sku: string;
    }>;
    const snapshotVariantsById = new Map(variantsToRestore.map((variant) => [Number(variant.id), variant]));
    const existingVariantsById = new Map(existingVariants.map((variant) => [variant.id, variant]));
    const snapshotVariantIds = snapshot.prepare('SELECT id FROM product_variants').all() as Array<{ id: number }>;
    const expectedDemoVariantCounts = new Map<number, number>();
    for (const variant of snapshot.prepare('SELECT product_id, COUNT(*) AS count FROM product_variants GROUP BY product_id').all() as Array<{
      product_id: number;
      count: number;
    }>) {
      expectedDemoVariantCounts.set(variant.product_id, variant.count);
    }
    for (const [productId, expectedCount] of expectedDemoVariantCounts) {
      if (DEMO_PRODUCTS.has(productId)) {
        const actualCount = existingVariants.filter((variant) => variant.product_id === productId).length;
        if (actualCount !== expectedCount) {
          return { restored: false, reason: 'live-startup-variant-count-mismatch' };
        }
      }
    }
    if (existingVariants.filter((variant) => variant.id <= 35).length !== snapshotDemoVariants.count) {
      return { restored: false, reason: 'live-startup-variant-id-mismatch' };
    }
    const maxSnapshotProductId = Math.max(...snapshotProductIds);
    const maxSnapshotVariantId = Math.max(...snapshotVariantIds.map((variant) => variant.id));
    for (const variant of existingVariants) {
      if (variant.id <= 35) {
        if (!DEMO_PRODUCTS.has(variant.product_id)) {
          return { restored: false, reason: 'live-startup-variant-product-mismatch' };
        }
        continue;
      }
      const snapshotVariant = snapshotVariantsById.get(variant.id);
      if (
        snapshotVariant
        && Number(snapshotVariant.product_id) === variant.product_id
        && snapshotVariant.variant_sku === variant.variant_sku
      ) {
        continue;
      }
      const liveProduct = existingProductsById.get(variant.product_id);
      if (variant.id > maxSnapshotVariantId && liveProduct && liveProduct.id > maxSnapshotProductId && liveProduct.status === 'draft') {
        continue;
      }
      return { restored: false, reason: 'live-variant-data-conflict' };
    }

    const productsToInsert = productsToRestore.filter((product) => !existingProductsById.has(Number(product.id)));
    const variantsToInsert = variantsToRestore.filter((variant) => !existingVariantsById.has(Number(variant.id)));
    for (const product of productsToInsert) {
      if (db.prepare('SELECT 1 FROM products WHERE base_sku = ?').get(product.base_sku)) {
        return { restored: false, reason: 'product-sku-conflict' };
      }
    }
    for (const variant of variantsToInsert) {
      if (db.prepare('SELECT 1 FROM product_variants WHERE variant_sku = ?').get(variant.variant_sku)) {
        return { restored: false, reason: 'variant-sku-conflict' };
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

      for (const product of productsToInsert) {
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

      for (const variant of variantsToInsert) {
        insertVariant.run(...variantColumns.map((column) => variant[column]));
      }

      const activateProduct = db.prepare("UPDATE products SET status = 'active' WHERE id = ? AND status = 'draft'");
      for (const productId of productsToActivate) activateProduct.run(productId);
      db.prepare(`
        UPDATE products
        SET status = 'draft'
        WHERE id IN (${Array.from(DEMO_PRODUCTS.keys()).join(',')})
      `).run();
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
        .run(RESTORE_SETTING_KEY, JSON.stringify({
          snapshotHash,
          productsImported: productsToInsert.length,
          productsActivated: productsToActivate.length,
          variantsImported: variantsToInsert.length,
          backupPath,
        }));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    return {
      restored: true,
      productsImported: productsToInsert.length,
      productsActivated: productsToActivate.length,
      variantsImported: variantsToInsert.length,
      backupPath,
    };
  } finally {
    snapshot.close();
  }
}
