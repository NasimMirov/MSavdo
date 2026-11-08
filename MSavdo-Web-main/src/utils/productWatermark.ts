import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const WATERMARK_STYLE = 'gray-small-v2';

export function productImageToken(source: string, watermark: Buffer, legacy = false): string {
  const hash = crypto.createHash('sha256').update(watermark).digest('hex');
  const version = legacy ? hash : `${hash}\n${WATERMARK_STYLE}`;
  return crypto.createHash('sha256').update(`${version}\n${source.trim()}`).digest('hex');
}

export async function saveWatermarkedUpload(input: Buffer, watermark: Buffer, uploadsDir: string): Promise<string> {
  const imageHash = crypto.createHash('sha256').update(input).digest('hex');
  const token = productImageToken(imageHash, watermark);
  const filename = `${token}.watermarked.jpg`;
  const output = await renderProductWatermark(input, watermark, token);
  try {
    await fs.writeFile(path.join(uploadsDir, filename), output, { flag: 'wx' });
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
  }
  return filename;
}

export function isWatermarkedUpload(source: string, mediaBaseUrl: string): boolean {
  try {
    const url = new URL(source, mediaBaseUrl);
    return url.origin === new URL(mediaBaseUrl).origin &&
      /^\/uploads\/[a-f0-9]{64}\.watermarked\.jpg$/.test(url.pathname);
  } catch {
    return false;
  }
}

export async function renderProductWatermark(input: Buffer, watermark: Buffer, token: string): Promise<Buffer> {
  const image = sharp(input, { limitInputPixels: 40000000, animated: false });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || !['jpeg', 'png', 'webp', 'gif', 'heif', 'avif'].includes(metadata.format || '')) {
    throw new Error('Формат фото не поддерживается');
  }
  const swapsDimensions = metadata.orientation !== undefined && metadata.orientation >= 5 && metadata.orientation <= 8;
  const width = swapsDimensions ? metadata.height : metadata.width;
  const height = swapsDimensions ? metadata.width : metadata.height;
  const margin = Math.min(Math.max(1, Math.round(Math.min(width, height) * 0.025)), Math.floor((Math.min(width, height) - 1) / 2));
  const logoWidth = Math.max(1, Math.min(160, Math.round(width * 0.12), width - 2 * margin));
  const resizedLogo = await sharp(watermark)
    .resize({ width: logoWidth, height: Math.max(1, height - 2 * margin), fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let index = 0; index < resizedLogo.data.length; index += 4) {
    const grey = Math.round(0.2126 * resizedLogo.data[index] + 0.7152 * resizedLogo.data[index + 1] + 0.0722 * resizedLogo.data[index + 2]);
    resizedLogo.data[index] = grey;
    resizedLogo.data[index + 1] = grey;
    resizedLogo.data[index + 2] = grey;
    resizedLogo.data[index + 3] = Math.round(resizedLogo.data[index + 3] * 0.50);
  }
  const logo = await sharp(resizedLogo.data, {
    raw: { width: resizedLogo.info.width, height: resizedLogo.info.height, channels: 4 },
  }).png().toBuffer();
  const corners = [
    { left: margin, top: margin },
    { left: Math.max(margin, width - resizedLogo.info.width - margin), top: margin },
    { left: margin, top: Math.max(margin, height - resizedLogo.info.height - margin) },
    {
      left: Math.max(margin, width - resizedLogo.info.width - margin),
      top: Math.max(margin, height - resizedLogo.info.height - margin),
    },
  ];
  const corner = corners[Number.parseInt(token.slice(0, 2), 16) % corners.length];
  return image.rotate().composite([{ input: logo, ...corner, blend: 'over' }])
    .jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}
