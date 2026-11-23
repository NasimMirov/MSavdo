import { next } from '@vercel/functions';
import { renderHomeCatalog } from './seo-home.js';

const catalogUrl = 'https://api.msavdo.shop/api/seo/home';
const rootPlaceholder = '<div id="root"><p>M.Savdo (МСавдо) — Маркази Савдо. <a href="/catalog/1">Открыть каталог товаров</a>.</p></div>';

function escapeAttribute(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function productPath(product) {
  const slug = String(product.title || '').normalize('NFC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 80) || 'product';
  return `/product/${product.id}/${encodeURIComponent(slug)}`;
}

export default async function proxy(request) {
  if (request.method !== 'GET') return next();
  const requestUrl = new URL(request.url);
  const hostname = requestUrl.hostname;
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
    const renderedHtml = html.replace(rootPlaceholder, () => `<div id="root">${renderHomeCatalog(data.products)}</div>`);
    const productQuery = requestUrl.searchParams.get('product') || '';
    const hasProductQuery = /^\d+$/.test(productQuery);
    let seoHtml = renderedHtml;
    if (hasProductQuery) {
      let product = data.products.find((item) => Number(item.id) === Number(productQuery));
      if (!product) {
        try {
          const productResponse = await fetch(`${catalogUrl.replace('/api/seo/home', '')}/api/products/${productQuery}`, {
            signal: AbortSignal.timeout(3000),
          });
          if (productResponse.ok) {
            const productData = await productResponse.json();
            product = productData?.product;
          }
        } catch {
          product = undefined;
        }
      }
      const canonical = product
        ? new URL(productPath(product), requestUrl.origin).href
        : new URL('/', requestUrl.origin).href;
      seoHtml = renderedHtml
        .replace(/<link rel="canonical" href="[^"]*"\s*\/?\s*>/i, `<link rel="canonical" href="${escapeAttribute(canonical)}" />`)
        .replace(/<meta property="og:url" content="[^"]*"\s*\/?\s*>/i, `<meta property="og:url" content="${escapeAttribute(canonical)}" />`)
        .replace(/<meta name="robots"[^>]*>/i, '<meta name="robots" content="noindex,follow">')
        .replace(/<meta name="googlebot"[^>]*>/i, '<meta name="googlebot" content="noindex,follow">');
    }
    return new Response(seoHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        ...(hasProductQuery ? { 'X-Robots-Tag': 'noindex, follow' } : {}),
      },
    });
  } catch (error) {
    console.error('[SEO Homepage] Unable to render the catalog:', error);
    return next();
  }
}
