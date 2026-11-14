import { next } from '@vercel/functions';
import { renderHomeCatalog } from './seo-home.js';

const catalogUrl = 'https://api.msavdo.shop/api/seo/home';
const rootPlaceholder = '<div id="root"><p>M.Savdo (МСавдо) — Маркази Савдо. <a href="/catalog/1">Открыть каталог товаров</a>.</p></div>';

export default async function proxy(request) {
  if (request.method !== 'GET') return next();
  const hostname = new URL(request.url).hostname;
  if (hostname !== 'msavdo.shop' && !hostname.endsWith('.vercel.app')) return next();
  try {
    const templateUrl = new URL('/index.html', request.url);
    const previewCookie = hostname.endsWith('.vercel.app') ? request.headers.get('cookie') : null;
    const [template, catalog] = await Promise.all([
      fetch(templateUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(4000),
        headers: previewCookie ? { cookie: previewCookie } : {},
      }),
      fetch(catalogUrl, { signal: AbortSignal.timeout(4000) }),
    ]);
    if (!template.ok || !catalog.ok) throw new Error(`Homepage sources returned ${template.status} and ${catalog.status}`);
    const [html, data] = await Promise.all([template.text(), catalog.json()]);
    if (!html.includes(rootPlaceholder) || !Array.isArray(data.products)) {
      throw new Error('Homepage template or catalog has an unexpected format');
    }
    return new Response(html.replace(rootPlaceholder, () => `<div id="root">${renderHomeCatalog(data.products)}</div>`), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('[SEO Homepage] Unable to render the catalog:', error);
    return next();
  }
}
