const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

test("isolated import, AI authorization, server pricing and promotion limits", { timeout: 60000 }, async () => {
  const project = path.resolve(__dirname, "..");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "msavdo-import-test-"));
  const utils = path.join(temp, "src", "utils");
  fs.mkdirSync(utils, { recursive: true });
  fs.copyFileSync(path.join(project, "server.ts"), path.join(temp, "server.ts"));
  for (const file of ["semanticAi.ts", "pricing.ts", "productDescription.ts", "importVariants.ts", "promotions.ts"]) {
    fs.copyFileSync(path.join(project, "src", "utils", file), path.join(utils, file));
  }
  fs.symlinkSync(path.join(project, "node_modules"), path.join(temp, "node_modules"), "junction");
  const port = await new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.on("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const selected = socket.address().port;
      socket.close(() => resolve(selected));
    });
  });
  const secret = "local-test-secret-0123456789-abcdefgh";
  const child = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    cwd: temp,
    env: { ...process.env, NODE_ENV: "development", PORT: String(port), GEMINI_API_KEY: "", ADMIN_JWT_SECRET: secret, ADMIN_TELEGRAM_ALLOWED_IDS: "111,222" },
    stdio: "ignore",
  });
  const base = `http://127.0.0.1:${port}`;
  let db;
  try {
    let ready = false;
    for (let i = 0; i < 100; i += 1) {
      try { if ((await fetch(`${base}/api/ping`)).ok) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, "test server did not start");
    const headers = { "Content-Type": "application/json" };
    const categoryResponse = await fetch(`${base}/api/import-categories`);
    assert.equal(categoryResponse.status, 200);
    assert.ok((await categoryResponse.json()).categories.includes("Хозяйственные мелочи"));
    const assistant = { title: "Товар", description: "", source_text: "", instruction: "Улучши", history: [] };
    const unauthorized = await fetch(`${base}/api/admin/import-assistant`, { method: "POST", headers, body: JSON.stringify(assistant) });
    assert.equal(unauthorized.status, 401);
    const unauthorizedPrepare = await fetch(`${base}/api/admin/import-assistant`, {
      method: "POST", headers, body: JSON.stringify({ ...assistant, prepare_only: true }),
    });
    assert.equal(unauthorizedPrepare.status, 401);

    db = new DatabaseSync(path.join(temp, "msavdo.db"));
    db.prepare("INSERT INTO admin_users (username, password_hash) VALUES (?, ?)").run("test-admin", "unused");
    const admin = db.prepare("SELECT id FROM admin_users WHERE username = ?").get("test-admin");
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: admin.id, username: "test-admin", auth_method: "telegram", telegram_id: "111", exp: Math.floor(Date.now() / 1000) + 60, jti: "test-token" })).toString("base64url");
    const signature = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
    const authorized = await fetch(`${base}/api/admin/import-assistant`, {
      method: "POST", headers: { ...headers, Cookie: `__Host-msavdo_admin=${header}.${payload}.${signature}` }, body: JSON.stringify(assistant),
    });
    assert.equal(authorized.status, 503);
    assert.match((await authorized.json()).error, /не настроен/i);
    const invalidModel = await fetch(`${base}/api/admin/import-assistant`, {
      method: "POST", headers: { ...headers, Cookie: `__Host-msavdo_admin=${header}.${payload}.${signature}` }, body: JSON.stringify({ ...assistant, model: 'not-allowed' }),
    });
    assert.equal(invalidModel.status, 400);
    const preparedResponse = await fetch(`${base}/api/admin/import-assistant`, {
      method: "POST", headers: { ...headers, Cookie: `__Host-msavdo_admin=${header}.${payload}.${signature}` },
      body: JSON.stringify({ ...assistant, prepare_only: true, variant_labels: ["红色"] }),
    });
    assert.equal(preparedResponse.status, 200);
    const prepared = await preparedResponse.json();
    assert.ok(prepared.categories.includes("Хозяйственные мелочи"));
    assert.match(prepared.prompt, /红色/);
    const invalidPrepare = await fetch(`${base}/api/admin/import-assistant`, {
      method: "POST", headers: { ...headers, Cookie: `__Host-msavdo_admin=${header}.${payload}.${signature}` },
      body: JSON.stringify({ ...assistant, prepare_only: "true" }),
    });
    assert.equal(invalidPrepare.status, 400);

    const variants = Array.from({ length: 600 }, (_, i) => ({
      color: `型号${i}`, size: "Стандарт", price_cny: 23, stock: i, sku_id: `sku-${i}`,
    }));
    const response = await fetch(`${base}/api/add-product`, {
      method: "POST", headers,
      body: JSON.stringify({
        raw_text: "Solar camping light", raw_title: "Jin Professional Export Outdoor Solar Camping Light LED",
        manual_title: "Солнечный фонарь для кемпинга", manual_description: "Описание, проверенное редактором.",
        use_gemini: false, preserve_variant_names: true, preserve_reviewed_data: true,
        structured_data: { variants, specifications: [{ name: "Материал", value: "Пластик" }] },
      }),
    });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.product.title, "Солнечный фонарь для кемпинга");
    assert.equal(result.product.status, "draft");
    assert.equal(result.product.variants_count, 600);
    assert.deepEqual(result.product.specifications, [{ name: "Материал", value: "Пластик" }]);
    const savedProduct = db.prepare("SELECT description FROM products WHERE id = ?").get(result.product.id);
    assert.ok(savedProduct.description.includes("Описание, проверенное редактором."));
    assert.equal(savedProduct.description.includes("Ключевые слова для поиска:"), false);
    const saved = db.prepare("SELECT color, price_cny, price_tjs FROM product_variants WHERE product_id = ? ORDER BY id").all(result.product.id);
    assert.equal(saved.length, 600);
    assert.equal(saved[599].color, "型号599");
    assert.ok(saved.every((item) => item.price_cny === 0 && item.price_tjs === 0));
    const invalidCategory = await fetch(`${base}/api/add-product`, {
      method: "POST", headers,
      body: JSON.stringify({ raw_text: "фонарь", manual_title: "Фонарь", use_gemini: false, category_name: "Несуществующая категория" }),
    });
    assert.equal(invalidCategory.status, 400);

    const cookie = `__Host-msavdo_admin=${header}.${payload}.${signature}`;
    db.prepare("UPDATE products SET status = 'active' WHERE id = ?").run(result.product.id);
    db.prepare("UPDATE product_variants SET price_tjs = 100 WHERE product_id = ?").run(result.product.id);
    const variant = db.prepare("SELECT id FROM product_variants WHERE product_id = ? ORDER BY id LIMIT 1").get(result.product.id);
    const promo = {
      title: 'Промокод', kind: 'discount', discount_type: 'percent', discount_value: 10,
      scope: 'order', product_ids: [], category_ids: [], min_quantity: 1, min_total: 0,
      code: 'SALE', starts_at: null, ends_at: null, max_uses: 1, stackable: false, priority: 0, active: true,
    };
    const createPromo = await fetch(`${base}/api/admin/promotions`, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify(promo) });
    assert.equal(createPromo.status, 201);
    const promoId = (await createPromo.json()).id;
    const invalidPromo = await fetch(`${base}/api/admin/promotions`, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ ...promo, discount_value: 101 }) });
    assert.equal(invalidPromo.status, 400);
    const cart = [{ product_id: result.product.id, variant_id: variant.id, quantity: 2, price_tjs: 1 }];
    const quoteResponse = await fetch(`${base}/api/order-quote`, { method: 'POST', headers, body: JSON.stringify({ items: cart, code: 'sale' }) });
    const quote = await quoteResponse.json();
    assert.deepEqual([quote.subtotal, quote.discount, quote.total], [200, 20, 180]);
    db.prepare("UPDATE product_variants SET price_tjs = 120 WHERE id = ?").run(variant.id);
    const orderBody = { items: cart, customer_phone: '+992900000000', promotion_code: 'SALE', quote_fingerprint: quote.fingerprint, total_amount: 1 };
    const stale = await fetch(`${base}/api/orders`, { method: 'POST', headers, body: JSON.stringify(orderBody) });
    assert.equal(stale.status, 409);
    const updatedQuote = (await stale.json()).quote;
    assert.equal(updatedQuote.total, 216);
    const orderResponse = await fetch(`${base}/api/orders`, { method: 'POST', headers, body: JSON.stringify({ ...orderBody, quote_fingerprint: updatedQuote.fingerprint }) });
    assert.equal(orderResponse.status, 201);
    const order = await orderResponse.json();
    assert.equal(order.quote.total, 216);
    assert.equal(db.prepare('SELECT total_amount FROM orders WHERE id = ?').get(order.order_id).total_amount, 216);
    assert.equal(db.prepare('SELECT amount FROM order_promotions WHERE order_id = ?').get(order.order_id).amount, 24);
    assert.equal(db.prepare('SELECT uses FROM promotions WHERE id = ?').get(promoId).uses, 1);
    const second = await fetch(`${base}/api/orders`, { method: 'POST', headers, body: JSON.stringify({ ...orderBody, quote_fingerprint: updatedQuote.fingerprint }) });
    assert.equal(second.status, 409);
    const cancel = await fetch(`${base}/api/admin/orders/${order.order_id}/status`, { method: 'PUT', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ status: 'cancelled' }) });
    assert.equal(cancel.status, 200);
    assert.equal(db.prepare('SELECT uses FROM promotions WHERE id = ?').get(promoId).uses, 1);
    const racePromo = await fetch(`${base}/api/admin/promotions`, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ ...promo, code: 'RACE' }) });
    const racePromoId = (await racePromo.json()).id;
    const raceQuote = await (await fetch(`${base}/api/order-quote`, { method: 'POST', headers, body: JSON.stringify({ items: cart, code: 'RACE' }) })).json();
    const raceBody = { ...orderBody, promotion_code: 'RACE', quote_fingerprint: raceQuote.fingerprint };
    const attempts = await Promise.all([1, 2].map(() => fetch(`${base}/api/orders`, { method: 'POST', headers, body: JSON.stringify(raceBody) })));
    assert.deepEqual(attempts.map((attempt) => attempt.status).sort(), [201, 409]);
    assert.equal(db.prepare('SELECT uses FROM promotions WHERE id = ?').get(racePromoId).uses, 1);
  } finally {
    if (db) db.close();
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
