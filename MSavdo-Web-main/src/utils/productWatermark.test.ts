import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { isWatermarkedUpload, productImageToken, renderProductWatermark, saveWatermarkedUpload } from './productWatermark.js';

test('watermark is small, grey, semi-transparent and fits the corner', async () => {
  const image = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const logo = await sharp({ create: { width: 200, height: 100, channels: 4, background: '#ff0000' } }).png().toBuffer();
  const output = await renderProductWatermark(image, logo, '00'.repeat(32));
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 400);
  assert.equal(info.height, 300);
  const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
  const marked = pixel(20, 15);
  assert.ok(marked.every((channel) => channel > 110 && channel < 220));
  assert.ok(Math.max(...marked) - Math.min(...marked) <= 4);
  assert.ok(pixel(70, 15).every((channel) => channel > 245));
});

test('uploaded images have the watermark once and retain stable, trusted filenames', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'msavdo-watermark-test-'));
  try {
    const image = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const logo = await sharp({ create: { width: 200, height: 100, channels: 4, background: '#000000' } }).png().toBuffer();
    const filename = await saveWatermarkedUpload(image, logo, dir);
    assert.equal(await saveWatermarkedUpload(image, logo, dir), filename);
    const stored = await fs.readFile(path.join(dir, filename));
    const token = filename.slice(0, 64);
    assert.deepEqual(stored, await renderProductWatermark(image, logo, token));
    assert.equal(isWatermarkedUpload(`/uploads/${filename}`, 'https://api.msavdo.shop'), true);
    assert.equal(isWatermarkedUpload(`https://evil.example/uploads/${filename}`, 'https://api.msavdo.shop'), false);
    assert.equal(isWatermarkedUpload('/uploads/old.jpg', 'https://api.msavdo.shop'), false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('watermark handles tiny images and retains the old token calculation', async () => {
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const logo = await sharp({ create: { width: 4, height: 4, channels: 4, background: '#000000' } }).png().toBuffer();
  const output = await renderProductWatermark(image, logo, '00'.repeat(32));
  assert.equal((await sharp(output).metadata()).width, 2);
  const source = 'https://example.test/image.jpg';
  const logoHash = crypto.createHash('sha256').update(logo).digest('hex');
  const oldToken = crypto.createHash('sha256').update(`${logoHash}\n${source}`).digest('hex');
  assert.equal(productImageToken(source, logo, true), oldToken);
  assert.notEqual(productImageToken(source, logo), oldToken);
});
