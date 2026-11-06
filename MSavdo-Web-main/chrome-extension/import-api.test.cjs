const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

test("isolated import saves edited titles and every zero-priced SKU; AI requires admin", { timeout: 60000 }, async () => {
  const project = path.resolve(__dirname, "..");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "msavdo-import-test-"));
  const utils = path.join(temp, "src", "utils");
  fs.mkdirSync(utils, { recursive: true });
  fs.copyFileSync(path.join(project, "server.ts"), path.join(temp, "server.ts"));
  for (const file of ["semanticAi.ts", "pricing.ts", "productDescription.ts", "importVariants.ts"]) {
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
  try {
    let ready = false;
    for (let i = 0; i < 100; i += 1) {
      try { if ((await fetch(`${base}/api/ping`)).ok) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, "test server did not start");
    const headers = { "Content-Type": "application/json" };
    const assistant = { title: "Товар", description: "", source_text: "", instruction: "Улучши", history: [] };
    const unauthorized = await fetch(`${base}/api/admin/import-assistant`, { method: "POST", headers, body: JSON.stringify(assistant) });
    assert.equal(unauthorized.status, 401);

    const db = new DatabaseSync(path.join(temp, "msavdo.db"));
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

    const variants = Array.from({ length: 600 }, (_, i) => ({
      color: `型号${i}`, size: "Стандарт", price_cny: 23, stock: i, sku_id: `sku-${i}`,
    }));
    const response = await fetch(`${base}/api/add-product`, {
      method: "POST", headers,
      body: JSON.stringify({
        raw_text: "Solar camping light", raw_title: "Jin Professional Export Outdoor Solar Camping Light LED",
        manual_title: "Солнечный фонарь для кемпинга", manual_description: "Описание, проверенное редактором.",
        use_gemini: false, preserve_variant_names: true, structured_data: { variants },
      }),
    });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.product.title, "Солнечный фонарь для кемпинга");
    assert.equal(result.product.status, "draft");
    assert.equal(result.product.variants_count, 600);
    const saved = db.prepare("SELECT color, price_cny, price_tjs FROM product_variants WHERE product_id = ? ORDER BY id").all(result.product.id);
    assert.equal(saved.length, 600);
    assert.equal(saved[599].color, "型号599");
    assert.ok(saved.every((item) => item.price_cny === 0 && item.price_tjs === 0));
    const invalidCategory = await fetch(`${base}/api/add-product`, {
      method: "POST", headers,
      body: JSON.stringify({ raw_text: "фонарь", manual_title: "Фонарь", use_gemini: false, category_name: "Несуществующая категория" }),
    });
    assert.equal(invalidCategory.status, 400);
    db.close();
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
