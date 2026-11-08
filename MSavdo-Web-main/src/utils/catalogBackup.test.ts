import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { createCatalogBackup } from './catalogBackup.js';

function unzipEntries(zip: Buffer): Map<string, Buffer> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0);
  const entries = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const result = new Map<string, Buffer>();
  for (let index = 0; index < entries; index += 1) {
    assert.equal(zip.readUInt32LE(offset), 0x02014b50);
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString();
    assert.equal(zip.readUInt32LE(localOffset), 0x04034b50);
    const start = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const compressed = zip.subarray(start, start + compressedSize);
    assert.ok(method === 0 || method === 8);
    result.set(name, method === 8 ? inflateRawSync(compressed) : compressed);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

test('creates a consistent downloadable backup with database and uploads', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'msavdo-backup-test-'));
  const db = new DatabaseSync(path.join(directory, 'live.db'));
  let cleanup: (() => Promise<void>) | undefined;
  try {
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE products (title TEXT); INSERT INTO products VALUES ('saved product')");
    const uploadsDir = path.join(directory, 'uploads');
    await fs.mkdir(uploadsDir);
    await fs.writeFile(path.join(uploadsDir, 'image.png'), 'image data');
    const backup = await createCatalogBackup(db, uploadsDir);
    cleanup = backup.cleanup;
    const entries = unzipEntries(await fs.readFile(backup.archivePath));
    assert.equal(entries.get('uploads/image.png')?.toString(), 'image data');
    assert.match(entries.get('README.txt')?.toString() ?? '', /External image URLs are not copied/);
    const snapshot = entries.get('msavdo.db');
    assert.ok(snapshot);
    const restoredPath = path.join(directory, 'restored.db');
    await fs.writeFile(restoredPath, snapshot);
    const restored = new DatabaseSync(restoredPath, { readOnly: true });
    try {
      assert.equal(restored.prepare('SELECT title FROM products').get()?.title, 'saved product');
    } finally {
      restored.close();
    }
    await backup.cleanup();
    await assert.rejects(fs.access(backup.archivePath));
  } finally {
    db.close();
    if (cleanup) await cleanup();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
