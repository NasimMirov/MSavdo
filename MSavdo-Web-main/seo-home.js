function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function productPath(product) {
  const slug = product.title.normalize('NFC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 80) || 'product';
  return `/product/${product.id}/${encodeURIComponent(slug)}`;
}

export function renderHomeCatalog(products) {
  const cards = products.filter((product) =>
    Number.isSafeInteger(product.id) && product.id > 0 && typeof product.title === 'string' && product.title.trim()
  ).map((product) => {
    let image = '';
    try {
      const url = new URL(product.main_image);
      if (url.origin === 'https://api.msavdo.shop' && !url.username && !url.password) {
        url.searchParams.set('width', '640');
        image = `<img src="${escapeHtml(url.href)}" alt="" width="320" height="320" loading="lazy">`;
      }
    } catch {
      // Products without an image still have a text link.
    }
    const price = Number(product.min_price_tjs);
    const priceText = Number.isFinite(price) && price > 0 ? `от ${price} сомони` : 'Уточните цену';
    const category = typeof product.category_name === 'string' ? product.category_name : '';
    return `<li><a href="${escapeHtml(productPath(product))}">${image}<span>${escapeHtml(category)}</span><strong>${escapeHtml(product.title)}</strong><span>${escapeHtml(priceText)}</span></a></li>`;
  }).join('');
  return `<style>.initial-catalog{max-width:1200px;margin:auto;padding:20px;font:16px/1.5 Arial,sans-serif;color:#172033}.initial-catalog ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:0;list-style:none}.initial-catalog li a{display:flex;flex-direction:column;gap:6px;padding:10px;border:1px solid #e2e8f0;border-radius:8px;color:inherit;text-decoration:none}.initial-catalog img{width:100%;height:auto;aspect-ratio:1;object-fit:contain}.initial-catalog li span{color:#475569}</style><main class="initial-catalog"><h1>M.Savdo — Маркази Савдо</h1><p>Товары с доставкой в Таджикистан.</p><h2>Товары магазина</h2><ul>${cards}</ul><p><a href="/catalog/1">Все товары M.Savdo</a></p></main>`;
}
