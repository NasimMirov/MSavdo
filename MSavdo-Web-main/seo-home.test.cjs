const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('homepage exposes current product links and falls back to the storefront if the API fails', async (t) => {
  const { default: proxy } = await import(pathToFileURL(path.join(__dirname, 'proxy.js')));
  const template = fs.readFileSync(path.join(__dirname, 'dist', 'index.html'), 'utf8');
  const originalFetch = global.fetch;
  const originalError = console.error;
  t.after(() => { global.fetch = originalFetch; console.error = originalError; });

  const products = [
    { id: 8, title: 'Очки <новые> $&', main_image: 'https://api.msavdo.shop/product-image/8/a.jpg', min_price_tjs: 390, category_name: 'Оптика' },
    { id: 9, title: 'Новый товар', main_image: 'https://other.example/image.jpg', min_price_tjs: 0 },
  ];
  global.fetch = async (url) => {
    if (String(url).startsWith('https://msavdo.shop/index.html')) return new Response(template);
    if (String(url) === 'https://api.msavdo.shop/api/seo/home') return Response.json({ products });
    throw new Error(`Unexpected request: ${url}`);
  };
  const response = await proxy(new Request('https://msavdo.shop/?product=8'));
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Очки &lt;новые&gt; \$&amp;/);
  assert.match(html, /href="\/product\/8\//);
  assert.match(html, /от 390 сомони/);
  assert.match(html, /product-image\/8\/a\.jpg\?width=640/);
  assert.doesNotMatch(html, /other\.example/);
  assert.match(html, /Новый товар/);
  assert.match(html, /src="\/assets\//);

  products.push({ id: 10, title: 'Добавленный товар', min_price_tjs: 100 });
  assert.match(await (await proxy(new Request('https://msavdo.shop/'))).text(), /Добавленный товар/);

  let templateCookie;
  global.fetch = async (url, options) => {
    if (String(url).startsWith('https://preview.vercel.app/index.html')) {
      templateCookie = options.headers.cookie;
      return new Response(template);
    }
    if (String(url) === 'https://api.msavdo.shop/api/seo/home') {
      assert.equal(options.headers, undefined);
      return Response.json({ products });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const preview = await proxy(new Request('https://preview.vercel.app/', { headers: { cookie: 'preview-auth=example' } }));
  assert.equal(templateCookie, 'preview-auth=example');
  assert.match(await preview.text(), /Добавленный товар/);

  let logged = false;
  console.error = () => { logged = true; };
  global.fetch = async () => { throw new Error('API unavailable'); };
  const fallback = await proxy(new Request('https://msavdo.shop/'));
  assert.equal(fallback.headers.get('x-middleware-next'), '1');
  assert.equal(logged, true);
});
