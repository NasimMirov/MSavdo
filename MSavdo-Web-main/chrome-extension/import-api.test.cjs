const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const sharp = require("sharp");

test("isolated import, AI authorization, server pricing and promotion limits", { timeout: 60000 }, async () => {
  const project = path.resolve(__dirname, "..");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "msavdo-import-test-"));
  const utils = path.join(temp, "src", "utils");
  fs.mkdirSync(utils, { recursive: true });
  fs.copyFileSync(path.join(project, "server.ts"), path.join(temp, "server.ts"));
  for (const file of ["semanticAi.ts", "pricing.ts", "productDescription.ts", "importVariants.ts", "importAiPrompt.ts", "promotions.ts", "tokenPlan.ts", "catalogSnapshotRestore.ts", "catalogBackup.ts", "productWatermark.ts", "demoSeed.ts"]) {
    fs.copyFileSync(path.join(project, "src", "utils", file), path.join(utils, file));
  }
  fs.mkdirSync(path.join(temp, "public"));
  fs.copyFileSync(path.join(project, "public", "msavdo-watermark.png"), path.join(temp, "public", "msavdo-watermark.png"));
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
  const child = spawn(process.execPath, ["--require", path.join(project, "chrome-extension", "tokenplan-fixture.cjs"), "--import", "tsx", "server.ts"], {
    cwd: temp,
    env: { ...process.env, NODE_ENV: "development", PORT: String(port), PUBLIC_BASE_URL: `http://127.0.0.1:${port}`, GEMINI_API_KEY: "", ADMIN_JWT_SECRET: secret, ADMIN_TELEGRAM_ALLOWED_IDS: "111,222", TOKENPLAN_TEST_LOG: path.join(temp, "tokenplan.log") },
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
    const adminProductsResponse = await fetch(`${base}/api/admin/products`, {
      headers: { Cookie: `__Host-msavdo_admin=${header}.${payload}.${signature}` },
    });
    assert.equal(adminProductsResponse.status, 200);
    const adminProducts = (await adminProductsResponse.json()).products;
    const importedDraft = adminProducts.find((product) => product.id === result.product.id);
    assert.ok(importedDraft, "the imported product must appear in the admin catalog");
    assert.equal(importedDraft.status, "draft");
    assert.equal(importedDraft.base_sku, result.product.base_sku);
    assert.equal(importedDraft.variants.length, 600);
    const sourceTitle = "精密螺旋千分测量仪";
    const html = `<!--${"x".repeat(51000)}-->window.context = ${JSON.stringify({
      offerDetail: {
        subject: sourceTitle,
        featureAttributes: [{ name: "Материал", value: "Пластик" }],
        skuInfoMap: { "红色": { price: "12", canBookCount: 3, skuId: "sku-red" } },
      },
    })};`;
    const codeResponse = await fetch(`${base}/api/add-product`, {
      method: "POST", headers,
      body: JSON.stringify({ raw_html_text: html, use_gemini: false, preserve_variant_names: true, preserve_source_title: true }),
    });
    assert.equal(codeResponse.status, 201);
    const codeResult = await codeResponse.json();
    assert.equal(codeResult.product.title, sourceTitle);
    assert.equal(codeResult.product.variants_count, 1);
    assert.match(codeResult.product.variants[0].color, /Красный/);
    assert.equal(codeResult.product.variants[0].stock, 3);
    const largeResponse = await fetch(`${base}/api/add-product`, {
      method: "POST", headers,
      body: JSON.stringify({ raw_html_text: "x".repeat(2000001), use_gemini: false }),
    });
    assert.equal(largeResponse.status, 400);
    assert.match((await largeResponse.json()).message, /2 000 000/);
    const invalidCategory = await fetch(`${base}/api/add-product`, {
      method: "POST", headers,
      body: JSON.stringify({ raw_text: "фонарь", manual_title: "Фонарь", use_gemini: false, category_name: "Несуществующая категория" }),
    });
    assert.equal(invalidCategory.status, 400);

    const cookie = `__Host-msavdo_admin=${header}.${payload}.${signature}`;
    const editUrl = `${base}/api/admin/products/${codeResult.product.id}`;
    const editHeaders = { ...headers, Cookie: cookie };
    const importedVariant = db.prepare("SELECT id, price_cny, stock FROM product_variants WHERE product_id = ?").get(codeResult.product.id);
    const editableProduct = {
      title: codeResult.product.title,
      description: "Описание фонаря.",
      category_id: codeResult.product.category_id,
      status: "draft",
      delivery_type: "order",
      variants: [
        { id: importedVariant.id, color: "Красный", size: "Стандарт", price_tjs: 0, quantity_discount_min: 2, quantity_discount_percent: 20, weight_kg: 0.5 },
        { color: "Черный", size: "Стандарт", price_cny: 0, price_tjs: 0, stock: 0, weight_kg: 0.5 },
      ],
    };
    const updateVariants = (nextVariants, status = "draft") => fetch(editUrl, {
      method: "PUT", headers: editHeaders, body: JSON.stringify({ ...editableProduct, variants: nextVariants, status }),
    });
    assert.equal((await updateVariants(editableProduct.variants)).status, 200);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_variants WHERE product_id = ?").get(codeResult.product.id).count, 2);
    const preservedVariant = db.prepare("SELECT price_cny, stock, quantity_discount_min, quantity_discount_percent FROM product_variants WHERE product_id = ? AND color = ?").get(codeResult.product.id, "Красный");
    assert.deepEqual(
      [preservedVariant.price_cny, preservedVariant.stock, preservedVariant.quantity_discount_min, preservedVariant.quantity_discount_percent],
      [importedVariant.price_cny, importedVariant.stock, 2, 20],
    );
    assert.equal((await updateVariants([editableProduct.variants[1]])).status, 200);
    assert.deepEqual(
      db.prepare("SELECT color FROM product_variants WHERE product_id = ?").all(codeResult.product.id).map((variant) => variant.color),
      ["Черный"],
    );
    assert.equal((await updateVariants([])).status, 200);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_variants WHERE product_id = ?").get(codeResult.product.id).count, 0);
    const emptyVariantsAdmin = await fetch(`${base}/api/admin/products`, { headers: editHeaders });
    assert.equal((await emptyVariantsAdmin.json()).products.find((product) => product.id === codeResult.product.id).variants.length, 0);
    assert.equal((await updateVariants([], "active")).status, 400);
    const pairDenied = await fetch(`${base}/api/admin/extension-import-key`, { method: "POST" });
    assert.equal(pairDenied.status, 401);
    const pairResponse = await fetch(`${base}/api/admin/extension-import-key`, { method: "POST", headers: { Cookie: cookie } });
    assert.equal(pairResponse.status, 200);
    const importKey = (await pairResponse.json()).key;
    assert.match(importKey, /^[a-f0-9]{64}$/);
    assert.notEqual(db.prepare("SELECT value FROM settings WHERE key = 'extension_import_key_hash'").get().value, importKey);
    const autoPayload = {
      raw_text: "Solar camping light", raw_title: "Solar camping light", description: "Описание фонаря для кемпинга.",
      automatic_ai: true, preserve_variant_names: true,
      images: ["https://example.com/product.jpg"],
      structured_data: { variants, specifications: [{ name: "Материал", value: "Пластик" }] },
    };
    const countBefore = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
    const deniedAuto = await fetch(`${base}/api/add-product`, {
      method: "POST", headers, body: JSON.stringify(autoPayload),
    });
    assert.equal(deniedAuto.status, 401);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM products").get().count, countBefore);
    assert.equal((await fetch(`${base}/api/extension/import-access`, { headers: { "X-Msavdo-Import-Key": importKey } })).status, 200);
    const autoHeaders = { ...headers, "X-Msavdo-Import-Key": importKey };
    const waitForJob = async (id) => {
      for (let i = 0; i < 100; i++) {
        const statusResponse = await fetch(`${base}/api/extension/import-status/${id}`, { headers: autoHeaders });
        assert.equal(statusResponse.status, 200);
        const job = await statusResponse.json();
        if (!["queued", "processing"].includes(job.status)) return job;
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      assert.fail("automatic import did not finish");
    };
    const failedAutoResponse = await fetch(`${base}/api/add-product`, {
      method: "POST", headers: autoHeaders, body: JSON.stringify(autoPayload),
    });
    assert.equal(failedAutoResponse.status, 201);
    const failedAuto = await failedAutoResponse.json();
    assert.equal(failedAuto.automatic_ai.status, "queued");
    const failedJob = await waitForJob(failedAuto.product.id);
    assert.equal(failedJob.status, "failed");
    assert.match(failedJob.message, /ключ TokenPlan/);
    assert.equal(db.prepare("SELECT status FROM products WHERE id = ?").get(failedAuto.product.id).status, "draft");
    const categoryId = db.prepare("SELECT id FROM categories WHERE name = ?").get("Хозяйственные мелочи").id;
    const manualSourceLink = "https://detail.1688.com/offer/123456789.html";
    const createdManually = await fetch(`${base}/api/admin/products`, {
      method: "POST", headers: { ...headers, Cookie: cookie },
      body: JSON.stringify({
        title: "Ручной заказ товара", description: "Описание товара для ручного заказа.",
        category_id: categoryId, delivery_type: "order", original_link: manualSourceLink,
      }),
    });
    assert.equal(createdManually.status, 201);
    const manualProduct = await createdManually.json();
    assert.match(manualProduct.product.base_sku, /^[A-Z0-9]{6}$/);
    assert.match(manualProduct.product.variants[0].variant_sku, /^[A-Z0-9]{6}-[A-Z0-9]{5}$/);
    assert.equal(db.prepare("SELECT original_link FROM products WHERE id = ?").get(manualProduct.product.id).original_link, manualSourceLink);
    const image = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const upload = await fetch(`${base}/api/admin/upload-image`, {
      method: "POST", headers: { ...headers, Cookie: cookie },
      body: JSON.stringify({ image: `data:image/png;base64,${image.toString("base64")}` }),
    });
    assert.equal(upload.status, 200);
    const uploadedUrl = (await upload.json()).url;
    assert.match(uploadedUrl, /\.watermarked\.jpg$/);
    const uploadedImage = Buffer.from(await (await fetch(uploadedUrl)).arrayBuffer());
    assert.notDeepEqual(uploadedImage, image);
    const updatedSourceLink = "https://detail.1688.com/offer/987654321.html";
    const updateManual = await fetch(`${base}/api/admin/products/${manualProduct.product.id}`, {
      method: "PUT", headers: { ...headers, Cookie: cookie },
      body: JSON.stringify({
        title: "Ручной заказ товара", description: "Описание товара для ручного заказа.",
        category_id: categoryId, delivery_type: "order", status: "active",
        original_link: updatedSourceLink, main_image: uploadedUrl, images: [uploadedUrl], specifications: [],
      }),
    });
    assert.equal(updateManual.status, 200);
    assert.equal(db.prepare("SELECT original_link FROM products WHERE id = ?").get(manualProduct.product.id).original_link, updatedSourceLink);
    const publicManualProduct = (await (await fetch(`${base}/api/products/${manualProduct.product.id}`)).json()).product;
    const publicImageResponse = await fetch(publicManualProduct.main_image);
    assert.equal(publicImageResponse.status, 200);
    assert.deepEqual(Buffer.from(await publicImageResponse.arrayBuffer()), uploadedImage);
    const invalidSourceLink = await fetch(`${base}/api/admin/products/${manualProduct.product.id}`, {
      method: "PUT", headers: { ...headers, Cookie: cookie },
      body: JSON.stringify({
        title: "Ручной заказ товара", category_id: categoryId, original_link: "javascript:alert(1)",
      }),
    });
    assert.equal(invalidSourceLink.status, 400);
    const keyRequest = { method: "POST", headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ key: "dummy-tokenplan-key" }) };
    const unauthorizedKey = await fetch(`${base}/api/admin/tokenplan-key`, { ...keyRequest, headers });
    assert.equal(unauthorizedKey.status, 401);
    const keyResponse = await fetch(`${base}/api/admin/tokenplan-key`, keyRequest);
    assert.equal(keyResponse.status, 200);
    assert.equal(JSON.stringify(await keyResponse.json()).includes("dummy-tokenplan-key"), false);
    const encryptedKey = db.prepare("SELECT value FROM settings WHERE key = 'tokenplan_api_key_encrypted'").get().value;
    assert.ok(encryptedKey.startsWith("v1."));
    assert.equal(encryptedKey.includes("dummy-tokenplan-key"), false);
    const settingsResponse = await fetch(`${base}/api/admin/settings`, { headers: { Cookie: cookie } });
    const settings = await settingsResponse.json();
    assert.equal(settings.tokenplan_key_configured, true);
    assert.equal(JSON.stringify(settings).includes("dummy-tokenplan-key"), false);
    const suggestionBody = { title: "太阳能灯", description: "", specifications: [] };
    const suggest = (action) => fetch(`${base}/api/admin/product-suggestions`, {
      method: "POST", headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ ...suggestionBody, action }),
    });
    const rejectedSuggestion = await suggest("title");
    assert.equal(rejectedSuggestion.status, 503);
    assert.match((await rejectedSuggestion.json()).error, /401/);
    const replaceKey = await fetch(`${base}/api/admin/tokenplan-key`, {
      ...keyRequest, body: JSON.stringify({ key: "valid-test-key" }),
    });
    assert.equal(replaceKey.status, 200);
    const titleSuggestion = await (await suggest("title")).json();
    assert.equal(titleSuggestion.title, "Солнечный фонарь");
    assert.equal(titleSuggestion.source, "tokenplan");
    const descriptionSuggestion = await (await suggest("description")).json();
    assert.equal(descriptionSuggestion.description, "Фонарь для кемпинга.");
    const categorySuggestion = await (await suggest("category")).json();
    assert.equal(categorySuggestion.category_name, "Туризм, кемпинг и пикник");
    assert.ok(categorySuggestion.category_id > 0);
    const baselineResponse = await fetch(`${base}/api/add-product`, {
      method: "POST", headers, body: JSON.stringify({ ...autoPayload, automatic_ai: false }),
    });
    assert.equal(baselineResponse.status, 201);
    const baseline = await baselineResponse.json();
    const baselineSaved = db.prepare("SELECT title, description, specifications, images FROM products WHERE id = ?").get(baseline.product.id);
    fs.writeFileSync(path.join(temp, "tokenplan.log"), "");
    const autoResponse = await fetch(`${base}/api/add-product`, {
      method: "POST", headers: autoHeaders, body: JSON.stringify(autoPayload),
    });
    assert.equal(autoResponse.status, 201);
    const auto = await autoResponse.json();
    assert.equal((await waitForJob(auto.product.id)).status, "completed");
    const autoSaved = db.prepare("SELECT title, description, specifications, images, category_id FROM products WHERE id = ?").get(auto.product.id);
    assert.equal(autoSaved.title, baselineSaved.title);
    assert.equal(autoSaved.description, baselineSaved.description);
    assert.equal(autoSaved.specifications, baselineSaved.specifications);
    assert.equal(autoSaved.images, baselineSaved.images);
    const requests = fs.readFileSync(path.join(temp, "tokenplan.log"), "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(requests.length, 1);
    assert.match(requests[0].prompt, /подкатегорию/);
    assert.ok(requests[0].prompt.includes(autoSaved.title));
    assert.ok(requests[0].prompt.includes(autoSaved.description.slice(0, 4000).replace(/\n/g, "\\n")));
    assert.equal(autoSaved.category_id, categorySuggestion.category_id);
    const autoVariants = db.prepare("SELECT color, price_cny, price_tjs FROM product_variants WHERE product_id = ? ORDER BY id").all(auto.product.id);
    assert.equal(autoVariants.length, 600);
    assert.equal(autoVariants[599].color, "型号599");
    assert.ok(autoVariants.every((variant) => variant.price_cny === 0 && variant.price_tjs === 0));
    const raceResponse = await fetch(`${base}/api/add-product`, {
      method: "POST", headers: autoHeaders, body: JSON.stringify({ ...autoPayload, description: "TEST_DELAY" }),
    });
    const raceImport = await raceResponse.json();
    db.prepare("UPDATE products SET title = ? WHERE id = ?").run("Название изменено администратором", raceImport.product.id);
    const raceJob = await waitForJob(raceImport.product.id);
    assert.equal(raceJob.status, "failed");
    assert.match(raceJob.message, /изменён/);
    assert.equal(db.prepare("SELECT title FROM products WHERE id = ?").get(raceImport.product.id).title, "Название изменено администратором");
    const partialResponse = await fetch(`${base}/api/add-product`, {
      method: "POST", headers: autoHeaders, body: JSON.stringify({ ...autoPayload, manual_title: "TEST_CATEGORY_FAILURE" }),
    });
    const partialImport = await partialResponse.json();
    const partialJob = await waitForJob(partialImport.product.id);
    assert.equal(partialJob.status, "failed");
    assert.match(partialJob.message, /429/);
    assert.equal(db.prepare("SELECT title FROM products WHERE id = ?").get(partialImport.product.id).title, partialImport.product.title);
    let limited = false;
    for (let i = 0; i < 60; i++) {
      const attempt = await fetch(`${base}/api/add-product`, {
        method: "POST", headers: autoHeaders, body: JSON.stringify({ automatic_ai: true, raw_text: null }),
      });
      if (attempt.status === 429) { limited = true; break; }
      assert.equal(attempt.status, 400);
    }
    assert.equal(limited, true);
    const revoke = await fetch(`${base}/api/admin/extension-import-key`, { method: "DELETE", headers: { Cookie: cookie } });
    assert.equal(revoke.status, 200);
    assert.equal((await fetch(`${base}/api/extension/import-access`, { headers: autoHeaders })).status, 401);
    assert.equal((await fetch(`${base}/api/add-product`, { method: "POST", headers: autoHeaders, body: JSON.stringify(autoPayload) })).status, 401);
    db.prepare("UPDATE products SET status = 'active' WHERE id = ?").run(result.product.id);
    db.prepare("UPDATE product_variants SET price_tjs = 100 WHERE product_id = ?").run(result.product.id);
    const variant = db.prepare("SELECT id FROM product_variants WHERE product_id = ? ORDER BY id LIMIT 1").get(result.product.id);
    const discountResponse = await fetch(`${base}/api/admin/products/${result.product.id}/discount`, {
      method: 'PUT', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ discount_percent: 10 }),
    });
    assert.equal(discountResponse.status, 200);
    const discountedQuote = await (await fetch(`${base}/api/order-quote`, {
      method: 'POST', headers, body: JSON.stringify({ items: [{ product_id: result.product.id, variant_id: variant.id, quantity: 2 }] }),
    })).json();
    assert.deepEqual([
      discountedQuote.original_subtotal,
      discountedQuote.product_discount,
      discountedQuote.subtotal,
      discountedQuote.total,
      discountedQuote.items[0].original_price_tjs,
      discountedQuote.items[0].price_tjs,
    ], [200, 20, 180, 180, 100, 90]);
    db.prepare("UPDATE product_variants SET quantity_discount_min = 2, quantity_discount_percent = 20 WHERE id = ?").run(variant.id);
    const bulkSingle = await (await fetch(`${base}/api/order-quote`, {
      method: 'POST', headers, body: JSON.stringify({ items: [{ product_id: result.product.id, variant_id: variant.id, quantity: 1 }] }),
    })).json();
    assert.equal(bulkSingle.items[0].price_tjs, 90);
    const bulkSameVariant = await (await fetch(`${base}/api/order-quote`, {
      method: 'POST', headers, body: JSON.stringify({ items: [{ product_id: result.product.id, variant_id: variant.id, quantity: 2 }] }),
    })).json();
    assert.deepEqual([bulkSameVariant.items[0].price_tjs, bulkSameVariant.subtotal], [72, 144]);
    const siblingSku = `TEST-${crypto.randomBytes(5).toString('hex')}`;
    const siblingVariant = db.prepare(`
      INSERT INTO product_variants (product_id, color, size, price_cny, price_tjs, stock, weight_kg, volume_m3, variant_sku, quantity_discount_min, quantity_discount_percent)
      VALUES (?, 'Другой цвет', 'Стандарт', 0, 100, 10, 0.5, 0, ?, 2, 20)
    `).run(result.product.id, siblingSku);
    const separateVariants = await (await fetch(`${base}/api/order-quote`, {
      method: 'POST', headers,
      body: JSON.stringify({ items: [
        { product_id: result.product.id, variant_id: variant.id, quantity: 1 },
        { product_id: result.product.id, variant_id: Number(siblingVariant.lastInsertRowid), quantity: 1 },
      ] }),
    })).json();
    assert.deepEqual(separateVariants.items.map((item) => item.price_tjs), [90, 90]);
    const publicProduct = await (await fetch(`${base}/api/products/${result.product.id}`)).json();
    assert.equal(publicProduct.product.variants[0].original_price_tjs, 100);
    assert.equal(publicProduct.product.variants[0].price_tjs, 90);
    db.prepare('UPDATE product_variants SET quantity_discount_min = 0, quantity_discount_percent = 0 WHERE product_id = ?').run(result.product.id);
    db.prepare('UPDATE products SET discount_percent = 0 WHERE id = ?').run(result.product.id);

    for (let i = 0; i < 2; i += 1) {
      const tracked = await fetch(`${base}/api/searches`, { method: 'POST', headers, body: JSON.stringify({ query: 'редкий запрос тест' }) });
      assert.equal(tracked.status, 204);
    }
    for (let i = 0; i < 3; i += 1) {
      const tracked = await fetch(`${base}/api/searches`, { method: 'POST', headers, body: JSON.stringify({ query: 'частый запрос тест' }) });
      assert.equal(tracked.status, 204);
    }
    const insertPublicQuery = db.prepare(`
      INSERT INTO site_search_queries (normalized_query, query_text, searches_count, first_searched_at, last_searched_at)
      VALUES (?, ?, 5, ?, ?)
    `);
    for (let i = 0; i < 12; i += 1) {
      insertPublicQuery.run(`popular test ${i}`, `popular test ${i}`, new Date().toISOString(), new Date().toISOString());
    }
    const popularList = await (await fetch(`${base}/api/search/suggestions`)).json();
    assert.equal(popularList.popular.length, 10);
    const hiddenRare = await (await fetch(`${base}/api/search/suggestions?q=${encodeURIComponent('редкий запрос тест')}`)).json();
    assert.equal(hiddenRare.suggestions.includes('редкий запрос тест'), false);
    const visibleFrequent = await (await fetch(`${base}/api/search/suggestions?q=${encodeURIComponent('частый')}`)).json();
    assert.ok(visibleFrequent.suggestions.includes('частый запрос тест'));

    const manualQuery = 'Подсказка вручную';
    const addManualQuery = await fetch(`${base}/api/admin/search-queries`, {
      method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ query: manualQuery }),
    });
    assert.equal(addManualQuery.status, 201);
    const manualSuggestions = await (await fetch(`${base}/api/search/suggestions?q=${encodeURIComponent('подсказка')}`)).json();
    assert.ok(manualSuggestions.suggestions.includes(manualQuery));
    const hideManualQuery = await fetch(`${base}/api/admin/search-queries`, {
      method: 'PUT', headers: { ...headers, Cookie: cookie },
      body: JSON.stringify({ normalized_query: manualQuery.toLocaleLowerCase('ru'), public_enabled: false }),
    });
    assert.equal(hideManualQuery.status, 200);
    const hiddenManual = await (await fetch(`${base}/api/search/suggestions?q=${encodeURIComponent('подсказка')}`)).json();
    assert.equal(hiddenManual.suggestions.includes(manualQuery), false);

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
