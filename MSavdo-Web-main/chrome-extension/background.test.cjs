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

test("imports long pasted code using the default server and rejects unsupported pages", async () => {
  let listener;
  let sent;
  const chrome = {
    runtime: {
      getURL: () => "chrome-extension://test/",
      onMessage: { addListener(fn) { listener = fn; } },
    },
    storage: { local: { get: (_keys, callback) => callback({}) } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "background.js"), "utf8"), {
    chrome, URL, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      sent = { url, body: JSON.parse(options.body) };
      return { ok: true, headers: { get: () => "application/json" }, json: async () => ({ status: "success", product: {} }) };
    },
  });
  const send = (payload) => new Promise((resolve) => {
    listener({ action: "importProduct", payload }, { url: "chrome-extension://test/popup.html" }, resolve);
  });
  const code = "x".repeat(210000);
  const result = await send({ raw_html_text: code, original_link: "https://detail.1688.com/offer/123.html", use_gemini: false });
  assert.equal(result.success, true);
  assert.equal(sent.url, "https://api.msavdo.shop/api/add-product");
  assert.equal(sent.body.raw_html_text.length, code.length);
  const invalid = await send({ raw_html_text: code, original_link: "https://example.com/" });
  assert.equal(invalid.success, false);
  assert.match(invalid.error, /маркетплейсов/);
});
