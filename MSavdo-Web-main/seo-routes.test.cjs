const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { DatabaseSync } = require('node:sqlite');

function readStructuredData(html) {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length >= 2, 'expected separate Product and BreadcrumbList JSON-LD objects');
  return scripts.map((match) => JSON.parse(match[1]));
}

test('Vercel permanently redirects the www hostname to the canonical domain', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8'));
  assert.ok(config.redirects.some((redirect) =>
    redirect.permanent === true &&
    redirect.source === '/:path*' &&
    redirect.destination === 'https://msavdo.shop/:path*' &&
    redirect.has?.some((condition) => condition.type === 'host' && condition.value === 'www.msavdo.shop')
  ));
});

test('Vercel serves crawler instructions independently of the API', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8'));
  const robots = fs.readFileSync(path.join(__dirname, 'public', 'robots.txt'), 'utf8');
  assert.ok(!config.rewrites.some((rewrite) => rewrite.source === '/robots.txt'));
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.match(robots, /^Sitemap: https:\/\/msavdo\.shop\/sitemap\.xml$/m);
});

test('catalog and sitemap discover active products and product pages are identical for visitors and crawlers', { timeout: 60000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'msavdo-seo-test-'));
  let server;
  t.after(async () => {
    if (server && server.exitCode === null) {
      server.kill();
      await once(server, 'exit');
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  for (const name of ['server.ts', 'package.json', 'index.html', 'vite.config.ts', 'src', 'public']) {
    fs.cpSync(path.join(__dirname, name), path.join(directory, name), { recursive: true });
  }
  fs.symlinkSync(path.join(__dirname, 'node_modules'), path.join(directory, 'node_modules'), 'junction');
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  const base = `http://127.0.0.1:${port}`;
  let output = '';
  async function startServer() {
    server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
      cwd: directory,
      env: { ...process.env, NODE_ENV: 'development', PORT: String(port), PUBLIC_SITE_URL: base },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', (data) => { output += data; });
    server.stderr.on('data', (data) => { output += data; });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (server.exitCode !== null) break;
      try {
        ready = (await fetch(`${base}/robots.txt`)).ok;
        if (ready) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, `Server did not start: ${output}`);
  }
  await startServer();

  const db = new DatabaseSync(path.join(directory, 'msavdo.db'));
  db.exec("UPDATE products SET status = 'draft'");
  const insert = db.prepare("INSERT INTO products (title, description, base_sku, status) VALUES (?, ?, ?, ?)");
  let noOfferId;
  for (let i = 1; i <= 101; i++) {
    const result = insert.run(`Товар ${i}`, `Описание ${i}`, `seo-test-${i}`, 'active');
    if (i === 1) noOfferId = Number(result.lastInsertRowid);
  }
  const newProduct = insert.run('Умные очки Bluetooth Wi-Fi 16 ГБ', 'Доставка 18-30 дней!\n\nОписание очков', 'seo-test-glasses', 'active');
  const productId = Number(newProduct.lastInsertRowid);
  db.prepare('UPDATE products SET main_image = ?, images = ? WHERE id = ?')
    .run('/uploads/seo-test.jpg', '/uploads/seo-test-2.jpg', productId);
  db.prepare('UPDATE products SET specifications = ? WHERE id = ?')
    .run(JSON.stringify([{ name: 'Бренд', value: 'Test Brand' }]), productId);
  db.prepare('UPDATE products SET specifications = ? WHERE id = ?')
    .run(JSON.stringify([{ name: 'Бренд', value: 'Австралийские инвестиции / Материал оболочки / ABS' }]), noOfferId);
  db.prepare('UPDATE products SET specifications = ? WHERE id = ?')
    .run(JSON.stringify([
      { name: 'Бренд', value: 'Test Brand' },
      { name: 'Фото цвета: Чёрный', value: 'https://example.com/image.jpg' },
      { name: 'Количество заказов, размещенных за последние 30 дней', value: '100' },
      { name: 'Материал', value: 'Пластик' },
    ]), productId);
  const longNameId = Number(insert.run(`${'Длинное название '.repeat(20)}`, 'Длинное описание', 'seo-test-long-name', 'active').lastInsertRowid);
  const longColorId = Number(insert.run('Товар с длинным названием '.repeat(8), 'Описание товара', 'seo-test-long-color', 'active').lastInsertRowid);
  const categoryId = Number(db.prepare('INSERT INTO categories (name) VALUES (?)').run('Оптика для теста').lastInsertRowid);
  db.prepare('UPDATE products SET category_id = ? WHERE id = ?').run(categoryId, productId);
  db.prepare('UPDATE products SET discount_percent = 10 WHERE id = ?').run(productId);
  const insertVariant = db.prepare(`
    INSERT INTO product_variants (product_id, color, price_cny, price_tjs, variant_sku)
    VALUES (?, ?, 10, ?, ?)
  `);
  const variantId = Number(insertVariant.run(productId, 'Чёрный', 400, 'seo-test-black').lastInsertRowid);
  insertVariant.run(productId, 'Синий', 500, 'seo-test-blue');
  insertVariant.run(productId, 'Недоступный', 0.5, 'seo-test-invalid');
  insertVariant.run(longNameId, 'Чёрный', 600, 'seo-test-long-title-black');
  insertVariant.run(longNameId, 'Синий', 650, 'seo-test-long-title-blue');
  insertVariant.run(longColorId, `Описание модели ${'особенность '.repeat(12)}`, 700, 'seo-test-long-option-1');
  insertVariant.run(longColorId, `Описание модели ${'характеристика '.repeat(10)}`, 800, 'seo-test-long-option-2');
  const draftId = Number(insert.run('Черновик', 'Не публиковать', 'seo-test-draft', 'draft').lastInsertRowid);
  db.close();

  for (const search of ['очки умные', 'ОЧКИ   УМНЫЕ', 'bluetooth очки', 'очков Умные', 'seo-test-glasses',
    'уМнЫе wifi', 'черный очки', 'seo-test-black', 'оптика очки']) {
    const response = await fetch(`${base}/api/products?${new URLSearchParams({ search })}`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.total, 1, search);
    assert.equal(data.products[0].id, productId, search);
  }
  for (const search of ['очки телефон', '%', 'seo_test_glasses', 'Черновик']) {
    const data = await (await fetch(`${base}/api/products?${new URLSearchParams({ search })}`)).json();
    assert.equal(data.total, 0, search);
  }
  const filtered = await (await fetch(`${base}/api/products?${new URLSearchParams({ search: 'очки умные', delivery_type: 'stock' })}`)).json();
  assert.equal(filtered.total, 0);
  assert.equal(filtered.delivery_counts.order, 1);
  const catalogResponse = await fetch(`${base}/api/products?limit=24&offset=0&sort=popular`);
  assert.match(catalogResponse.headers.get('cache-control') || '', /private, max-age=30, stale-while-revalidate=120/);
  const catalog = await catalogResponse.json();
  assert.equal(catalog.total, catalog.delivery_counts.all);
  assert.equal(catalog.delivery_counts.order + catalog.delivery_counts.stock, catalog.delivery_counts.all);
  const categoryFiltered = await (await fetch(`${base}/api/products?${new URLSearchParams({ search: 'wifi черный', category_id: String(categoryId) })}`)).json();
  assert.equal(categoryFiltered.total, 1);
  assert.equal(categoryFiltered.products[0].id, productId);
  const hints = await (await fetch(`${base}/api/search/suggestions?${new URLSearchParams({ q: 'очки умные' })}`)).json();
  assert.ok(hints.suggestions.includes('Умные очки Bluetooth Wi-Fi 16 ГБ'));
  const wifiHints = await (await fetch(`${base}/api/search/suggestions?${new URLSearchParams({ q: 'WIFI' })}`)).json();
  assert.ok(wifiHints.suggestions.includes('Умные очки Bluetooth Wi-Fi 16 ГБ'));
  const wildcardHints = await (await fetch(`${base}/api/search/suggestions?${new URLSearchParams({ q: '%' })}`)).json();
  assert.deepEqual(wildcardHints.suggestions, []);

  const sitemapIndex = await (await fetch(`${base}/sitemap.xml`)).text();
  assert.match(sitemapIndex, /sitemap-products-2\.xml/);
  const sitemap = await (await fetch(`${base}/sitemap-products-1.xml`)).text();
  assert.match(sitemap, /\/catalog\/1/);
  assert.match(sitemap, new RegExp(`/product/${productId}/`));
  assert.doesNotMatch(sitemap, /Черновик|<lastmod>/);
  async function checkSitemapCoverage() {
    const index = await (await fetch(`${base}/sitemap.xml`)).text();
    const urls = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    const sitemapProducts = [];
    for (const sitemapUrl of urls) {
      const response = await fetch(sitemapUrl);
      assert.equal(response.status, 200);
      const xml = await response.text();
      sitemapProducts.push(...[...xml.matchAll(/<loc>[^<]*\/product\/(\d+)\//g)].map((match) => Number(match[1])));
    }
    const check = new DatabaseSync(path.join(directory, 'msavdo.db'));
    const expected = check.prepare("SELECT id FROM products WHERE status = 'active' ORDER BY id").all().map((row) => row.id);
    check.close();
    assert.equal(new Set(sitemapProducts).size, sitemapProducts.length, 'duplicate product URLs in sitemap');
    assert.deepEqual(sitemapProducts.sort((a, b) => a - b), expected);
    assert.ok(!sitemapProducts.includes(draftId));
  }
  await checkSitemapCoverage();
  const firstCatalog = await (await fetch(`${base}/catalog/1`)).text();
  assert.match(firstCatalog, /Умные очки Bluetooth Wi-Fi 16 ГБ/);
  assert.match(firstCatalog, /от 360 сомони/);
  assert.match(firstCatalog, /<img src="https:\/\/api\.msavdo\.shop\/product-image\//);
  assert.match(firstCatalog, /href="\/catalog\/2"/);
  assert.doesNotMatch(firstCatalog, /Черновик/);
  const homeCatalog = await (await fetch(`${base}/api/seo/home`)).json();
  assert.equal(homeCatalog.products.length, 24);
  assert.equal(homeCatalog.products.some((product) => product.id === draftId), false);
  const homeProduct = homeCatalog.products.find((product) => product.id === productId);
  assert.equal(homeProduct.min_price_tjs, 360);
  assert.equal(homeProduct.category_name, 'Оптика для теста');
  assert.equal(homeProduct.price_cny, undefined);
  const secondCatalog = await (await fetch(`${base}/catalog/2`)).text();
  assert.match(secondCatalog, /href="\/catalog\/1"/);
  assert.equal((await fetch(`${base}/catalog/3`)).status, 404);
  assert.equal((await fetch(`${base}/catalog/01`)).status, 404);
  assert.equal((await fetch(`${base}/product/${draftId}/draft`)).status, 404);
  const noOfferHtml = await (await fetch(`${base}/product/${noOfferId}/товар-1`)).text();
  const noOfferData = readStructuredData(noOfferHtml);
  assert.equal(noOfferData[0]['@type'], 'Product');
  assert.equal(noOfferData[0].offers, undefined);
  assert.equal(noOfferData[0].brand, undefined);
  assert.match(noOfferHtml, /Уточните цену/);
  assert.doesNotMatch(noOfferHtml, /Австралийские инвестиции/);
  const longNameHtml = await (await fetch(`${base}/product/${longNameId}/длинное-название`)).text();
  const longNameData = readStructuredData(longNameHtml);
  assert.equal(longNameData[0]['@type'], 'Product');
  assert.equal(Array.from(longNameData[0].name).length, 150);
  assert.equal(longNameData[0].description.length > 0, true);
  assert.equal(longNameData[0].hasVariant, undefined);
  const longColorHtml = await (await fetch(`${base}/product/${longColorId}/длинное-название`)).text();
  const longColorData = readStructuredData(longColorHtml)[0];
  assert.equal(longColorData['@type'], 'Product');
  assert.equal(Array.from(longColorData.name).length, 150);
  assert.equal(longColorData.color, undefined);
  assert.equal(longColorData.hasVariant, undefined);
  assert.doesNotMatch(JSON.stringify(longColorData), /Описание модели особенность/u);

  const url = `${base}/product/${productId}/${encodeURIComponent('умные-очки-bluetooth-wi-fi-16-гб')}`;
  const visitor = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const crawler = await fetch(url, { headers: { 'User-Agent': 'Googlebot' } });
  assert.equal(visitor.status, 200);
  const html = await visitor.text();
  assert.equal(html, await crawler.text());
  assert.match(html, /Умные очки Bluetooth Wi-Fi 16 ГБ — купить/);
  assert.match(html, /Описание очков/);
  assert.ok(html.indexOf('Выбрать вариант и заказать') < html.indexOf('<h2>Характеристики</h2>'));
  assert.ok(html.indexOf('Выбрать вариант и заказать') < html.indexOf('Фотографии товара'));
  assert.doesNotMatch(html, /Фото цвета: Чёрный|Количество заказов, размещенных за последние/);
  assert.match(html, /Материал/);
  assert.doesNotMatch(html, /<p>Купить Умные очки/);
  assert.doesNotMatch(html, /18-30/);
  assert.match(html, /12–35 дней/);
  assert.match(html, new RegExp(`href="/\\?product=${productId}"`));
  assert.doesNotMatch(html, /window\.location\.replace/);
  assert.match(html, /360–450 сомони/);
  assert.doesNotMatch(html, /Недоступный/);
  const structuredData = readStructuredData(html);
  const productData = structuredData[0];
  assert.equal(productData['@type'], 'Product');
  assert.equal(productData.image.length, 2);
  assert.ok(sitemap.includes(`<image:loc>${productData.image[0]}</image:loc>`));
  assert.equal(structuredData[1]['@type'], 'BreadcrumbList');
  assert.ok(productData.name.length > 0 && Array.from(productData.name).length <= 150);
  assert.ok(productData.description.length > 0);
  assert.equal(productData.brand['@type'], 'Brand');
  assert.equal(productData.brand.name, 'Test Brand');
  assert.equal(productData.offers['@type'], 'Offer');
  assert.equal(productData.offers.price, 360);
  assert.equal(productData.offers.priceCurrency, 'TJS');
  assert.equal(productData.offers.availability, undefined);
  assert.equal(productData.offers.shippingDetails['@type'], 'OfferShippingDetails');
  assert.equal(productData.offers.shippingDetails.shippingDestination.addressCountry, 'TJ');
  assert.equal(productData.offers.shippingDetails.shippingRate.value, 0);
  assert.equal(productData.offers.shippingDetails.deliveryTime.transitTime.minValue, 12);
  assert.equal(productData.offers.shippingDetails.deliveryTime.transitTime.maxValue, 35);
  assert.equal(productData.offers.hasMerchantReturnPolicy.returnPolicyCategory, 'https://schema.org/MerchantReturnNotPermitted');
  assert.doesNotMatch(JSON.stringify(productData), /ProductGroup|hasVariant/u);
  assert.match(html, /Умные очки Bluetooth Wi-Fi 16 ГБ — купить/);
  const quote = await fetch(`${base}/api/order-quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ product_id: productId, variant_id: variantId, quantity: 1 }] }),
  });
  assert.equal(quote.status, 200);
  const quoteData = await quote.json();
  assert.equal(quoteData.items[0].price_tjs, productData.offers.price);

  const orderDb = new DatabaseSync(path.join(directory, 'msavdo.db'));
  const year = new Date().getFullYear();
  const createOldOrder = orderDb.prepare("INSERT INTO orders (order_number, total_amount, items_json) VALUES (?, 0, '[]')");
  createOldOrder.run(`MS-${year}-9999`);
  createOldOrder.run(`MS-${year}-90000X`);
  createOldOrder.run(`MS-${year - 1}-999999`);
  orderDb.close();
  const orderBody = {
    items: [{ product_id: productId, variant_id: variantId, quantity: 1 }],
    customer_phone: '+992900000000',
    quote_fingerprint: quoteData.fingerprint,
  };
  const responses = await Promise.all(Array.from({ length: 25 }, () =>
    fetch(`${base}/api/orders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(orderBody),
    })
  ));
  for (const response of responses) assert.equal(response.status, 201, await response.clone().text());
  const createdOrders = await Promise.all(responses.map((response) => response.json()));
  const numbers = createdOrders.map((order) => order.order_number);
  assert.equal(new Set(numbers).size, 25);
  assert.deepEqual(numbers.map((number) => Number(number.slice(`MS-${year}-`.length))).sort((a, b) => a - b),
    Array.from({ length: 25 }, (_, index) => 10000 + index));
  const checkDb = new DatabaseSync(path.join(directory, 'msavdo.db'));
  assert.equal(checkDb.prepare('SELECT COUNT(*) AS count FROM order_items').get().count, 25);
  checkDb.close();

  const updatedDb = new DatabaseSync(path.join(directory, 'msavdo.db'));
  const addedId = Number(updatedDb.prepare(
    "INSERT INTO products (title, description, base_sku, status) VALUES (?, ?, ?, 'active')"
  ).run('Новый товар', 'Доставка 18-30 дней!\n\nНовая модель', 'seo-test-new').lastInsertRowid);
  updatedDb.prepare('UPDATE products SET title = ? WHERE id = ?').run('Новые умные очки', productId);
  updatedDb.prepare("UPDATE products SET delivery_type = 'stock' WHERE id = ?").run(productId);
  updatedDb.close();
  const updatedSitemap = await (await fetch(`${base}/sitemap-products-1.xml`)).text();
  assert.match(updatedSitemap, new RegExp(`/product/${addedId}/`));
  await checkSitemapCoverage();
  assert.match(await (await fetch(`${base}/catalog/1`)).text(), /Новый товар/);
  const oldUrl = await fetch(url, { redirect: 'manual' });
  assert.equal(oldUrl.status, 301);
  assert.match(decodeURI(oldUrl.headers.get('location')), /новые-умные-очки/);
  const updatedHtml = await (await fetch(oldUrl.headers.get('location'))).text();
  const updatedStructured = readStructuredData(updatedHtml);
  const updatedProductData = updatedStructured[0];
  assert.equal(updatedProductData['@type'], 'Product');
  assert.equal(updatedProductData.offers.availability, 'https://schema.org/InStock');
  assert.equal(updatedProductData.offers.shippingDetails.deliveryTime.handlingTime.maxValue, 1);
  assert.equal(updatedProductData.offers.shippingDetails.deliveryTime.transitTime.maxValue, 0);
  assert.match(updatedHtml, /В наличии в Душанбе/);
  assert.doesNotMatch(updatedHtml, /12–35 дней/);

  server.kill();
  await once(server, 'exit');
  await startServer();
  const newProductData = await (await fetch(`${base}/api/products/${addedId}`)).json();
  assert.equal(newProductData.product.description, 'Доставка 12–35 дней!\n\nНовая модель');
  const stockProductData = await (await fetch(`${base}/api/products/${productId}`)).json();
  assert.equal(stockProductData.product.description, 'Описание очков');
});
