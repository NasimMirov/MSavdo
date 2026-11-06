const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

class Element {
  constructor() { this.value = ""; this.textContent = ""; this.listeners = {}; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  click() { return this.listeners.click(); }
}

function setup({ failRead = false, importError = "" } = {}) {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  let onReady;
  const requests = [];
  let reads = 0;
  let injections = 0;
  const source = {
    raw_title: "Solar camping light", raw_text: "Solar camping light",
    images: ["https://example.com/image.jpg"],
    structured_data: { title: "Solar camping light", variants: Array.from({ length: 600 }, (_, i) => ({ color: `型号${i}`, size: "Стандарт", sku_id: `sku-${i}` })) },
  };
  const chrome = {
    tabs: {
      query: async () => [{ id: 1, url: "https://detail.1688.com/offer/123.html" }],
      sendMessage: async () => {
        reads++;
        if (failRead && reads === 1) throw new Error("not ready");
        return { success: true, payload: source };
      },
    },
    scripting: { executeScript: async () => { injections++; } },
    runtime: { sendMessage(message, callback) {
      requests.push(message);
      callback(importError ? { success: false, error: importError } : { success: true, product: { title: "Solar camping light", variants_count: 600 } });
    } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "popup.js"), "utf8"), {
    document: { addEventListener: (_name, callback) => { onReady = callback; }, getElementById: get },
    chrome,
  });
  onReady();
  return { get, requests, source, stats: () => ({ reads, injections }) };
}

test("reads and imports the current page, retaining all variants without AI", async () => {
  const { get, requests, stats } = setup({ failRead: true });
  await get("import").click();
  assert.deepEqual(stats(), { reads: 2, injections: 1 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].action, "importProduct");
  assert.equal(requests[0].payload.use_gemini, false);
  assert.equal(requests[0].payload.preserve_source_title, true);
  assert.equal(requests[0].payload.structured_data.variants.length, 600);
  assert.equal(requests[0].payload.structured_data.variants[599].sku_id, "sku-599");
  assert.match(get("status").textContent, /черновики/);
});

test("imports pasted code without reading the tab and reports server errors", async () => {
  const { get, requests, stats } = setup({ importError: "Ошибка сервера" });
  get("page-code").value = "window.context = {\"subject\":\"Фонарь\"}";
  await get("import").click();
  assert.equal(stats().reads, 0);
  assert.equal(requests[0].payload.raw_html_text, get("page-code").value);
  assert.equal(requests[0].payload.original_link, "https://detail.1688.com/offer/123.html");
  assert.equal(requests[0].payload.use_gemini, false);
  assert.equal(requests[0].payload.structured_data, undefined);
  assert.match(get("status").textContent, /Ошибка сервера/);
  assert.equal(get("page-code").value, requests[0].payload.raw_html_text);
  assert.equal(get("import").disabled, false);
});

test("rejects oversized code without sending an import", async () => {
  const { get, requests } = setup();
  get("page-code").value = "x".repeat(2000001);
  await get("import").click();
  assert.equal(requests.length, 0);
  assert.match(get("status").textContent, /2 000 000/);
});
