const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("extension service worker no longer handles AI and key messages", () => {
  let listener;
  const chrome = { runtime: { onMessage: { addListener(fn) { listener = fn; } } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "background.js"), "utf8"), { chrome, URL });
  for (const action of ["importAssistant", "saveTokenPlanKey", "checkTokenPlanKey", "saveGeminiKey"]) {
    assert.equal(listener({ action }, {}, () => assert.fail("unexpected response")), undefined);
  }
});

test("imports to the main catalog even when an old server address is saved", async () => {
  let listener;
  let sent;
  let responseBody = { status: "success", product: { id: 17, base_sku: "MS-17", status: "draft" } };
  const chrome = {
    runtime: {
      getURL: () => "chrome-extension://test/",
      onMessage: { addListener(fn) { listener = fn; } },
    },
    storage: { local: {
      get: async () => ({ serverUrl: "https://api.msavdo.shop", importKey: "a".repeat(64) }),
      set: async () => {},
      setAccessLevel: async () => {},
    } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "background.js"), "utf8"), {
    chrome, URL, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      sent = { url, body: JSON.parse(options.body), headers: options.headers };
      return { ok: true, headers: { get: () => "application/json" }, json: async () => responseBody };
    },
  });

  const send = (payload) => new Promise((resolve) => {
    listener({ action: "importProduct", payload }, { url: "chrome-extension://test/popup.html" }, resolve);
  });
  const code = "x".repeat(210000);
  const result = await send({ raw_html_text: code, original_link: "https://detail.1688.com/offer/123.html" });
  assert.equal(result.success, true);
  assert.equal(sent.url, "https://msavdo.shop/api/add-product");
  assert.equal(sent.body.raw_html_text.length, code.length);
  assert.equal(sent.body.automatic_ai, true);
  assert.equal(sent.body.preserve_reviewed_data, undefined);
  assert.equal(sent.body.use_gemini, undefined);
  assert.equal(sent.headers["X-Msavdo-Import-Key"], "a".repeat(64));
  assert.equal(result.product.id, 17);
  responseBody = { status: "success", product: {} };
  const unconfirmed = await send({ raw_html_text: code, original_link: "https://detail.1688.com/offer/123.html" });
  assert.equal(unconfirmed.success, false);
  assert.match(unconfirmed.error, /не подтвердил создание черновика/);
  const invalid = await send({ raw_html_text: code, original_link: "https://example.com/" });
  assert.equal(invalid.success, false);
  assert.match(invalid.error, /маркетплейсов/);
});

test("pairing is restricted to the popup and stores the key only after server verification", async () => {
  let listener;
  const saved = {};
  const chrome = {
    runtime: {
      getURL: (name) => `chrome-extension://test/${name}`,
      onMessage: { addListener(fn) { listener = fn; } },
    },
    storage: { local: {
      get: async () => saved,
      set: async (value) => Object.assign(saved, value),
      setAccessLevel: async ({ accessLevel }) => assert.equal(accessLevel, "TRUSTED_CONTEXTS"),
    } },
  };
  let accepted = false;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "background.js"), "utf8"), {
    chrome, URL, AbortController, setTimeout, clearTimeout,
    fetch: async (_url, options) => {
      assert.equal(options.headers["X-Msavdo-Import-Key"], "a".repeat(64));
      return { ok: accepted, json: async () => accepted ? { success: true } : { error: "invalid" } };
    },
  });
  const send = (sender) => new Promise((resolve) => {
    listener({ action: "pairImportKey", key: "a".repeat(64) }, sender, resolve);
  });
  const rejectedPage = await send({ url: "https://detail.1688.com/" });
  assert.equal(rejectedPage.success, false);
  const rejectedKey = await send({ url: "chrome-extension://test/popup.html" });
  assert.equal(rejectedKey.success, false);
  assert.equal(saved.importKey, undefined);
  accepted = true;
  assert.equal((await send({ url: "chrome-extension://test/popup.html" })).success, true);
  assert.equal(saved.importKey, "a".repeat(64));
});
