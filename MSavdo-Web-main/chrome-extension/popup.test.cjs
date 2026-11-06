const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

class Element {
  constructor() {
    this.value = "";
    this.textContent = "";
    this.style = {};
    this.children = [];
    this.listeners = {};
    this.hidden = false;
  }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  appendChild(child) { this.children.push(child); }
  replaceChildren() { this.children = []; this.textContent = ""; }
  setAttribute() {}
  async click() { return this.listeners.click?.(); }
}

test("preview, AI confirmation and import preserve all edited SKU rows", async () => {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  let onReady;
  let imported;
  let aiRequest;
  let personalKey = "";
  let tokenPlanKey = "";
  const source = {
    raw_title: "Jin Professional Export Outdoor Solar Camping Light LED",
    raw_text: "Solar camping light",
    original_link: "https://detail.1688.com/offer/123.html",
    images: [],
    structured_data: {
      title: "",
      specifications: [{ name: "材质", value: "塑料" }],
      variants: Array.from({ length: 600 }, (_, i) => ({
        color: `Вариант ${i}`, size: "Стандарт", sku_id: `sku-${i}`, stock: i, image_url: "",
      })),
    },
  };
  const store = {};
  get("ai-model").value = "gemini-3.5-flash-lite";
  const chrome = {
    tabs: {
      query: async () => [{ id: 1, title: source.raw_title, url: source.original_link }],
      sendMessage: async () => ({ success: true, payload: source }),
      create() {},
    },
    storage: { local: {
      get: (keys, callback) => callback(store),
      set: (data, callback) => { Object.assign(store, structuredClone(data)); callback?.(); },
    } },
    scripting: {},
    runtime: {
      sendMessage(message, callback) {
        if (message.action === "getGeminiKeyStatus") return Promise.resolve({ success: true, hasKey: !!personalKey });
        if (message.action === "saveGeminiKey") {
          personalKey = message.key;
          return Promise.resolve({ success: true, hasKey: true });
        }
        if (message.action === "removeGeminiKey") {
          personalKey = "";
          return Promise.resolve({ success: true, hasKey: false });
        }
        if (message.action === "getTokenPlanKeyStatus") return Promise.resolve({ success: true, hasKey: !!tokenPlanKey });
        if (message.action === "saveTokenPlanKey") {
          tokenPlanKey = message.key;
          return Promise.resolve({ success: true, hasKey: true });
        }
        if (message.action === "removeTokenPlanKey") {
          tokenPlanKey = "";
          return Promise.resolve({ success: true, hasKey: false });
        }
        if (message.action === "importAssistant") {
          aiRequest = message.payload;
          return Promise.resolve({ success: true, data: {
            reply: "Готово",
            proposal: {
              title: "Солнечный фонарь",
              description: "Описание фонаря.",
              category_name: "Хозяйственные мелочи",
              variant_labels: message.payload.variant_labels.map((label) => ({ "材质": "Материал", "塑料": "Пластик" }[label] || label)),
            },
          } });
        }
        if (message.action === "importProduct") {
          imported = message.payload;
          callback({ success: true, product: { title: imported.manual_title, variants_count: 600 } });
        }
      },
    },
  };
  const context = {
    document: {
      addEventListener: (_name, callback) => { onReady = callback; },
      getElementById: get,
      createElement: () => new Element(),
    },
    chrome,
    console,
    setTimeout,
    clearTimeout,
    confirm: () => true,
    window: {},
    navigator: {},
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "popup.js"), "utf8"), context);
  await onReady();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(get("key-status").textContent, /ключ сервера/);
  get("gemini-key").value = "first-test-key";
  await get("btn-save-key").click();
  assert.equal(personalKey, "first-test-key");
  assert.equal(get("gemini-key").value, "");
  assert.match(get("key-status").textContent, /Ключ Gemini сохранён/);
  get("gemini-key").value = "replacement-key";
  await get("btn-save-key").click();
  assert.equal(personalKey, "replacement-key");
  await get("btn-extract").click();
  assert.equal(get("manual-title").value, source.raw_title);
  assert.equal(get("variants-list").children.length, 600);
  get("chat-message").value = "Переведи название";
  await get("btn-ai").click();
  assert.equal(get("manual-title").value, source.raw_title);
  assert.equal(aiRequest.variant_labels.length, 3);
  assert.equal(aiRequest.model, "gemini-3.5-flash-lite");
  assert.equal(JSON.stringify(aiRequest).includes(personalKey), false);
  await get("btn-apply-ai").click();
  assert.equal(get("manual-title").value, "Солнечный фонарь");
  assert.equal(get("specifications-list").children[0].children[0].value, "Материал");
  assert.equal(get("specifications-list").children[0].children[1].value, "Пластик");
  get("variants-list").children[0].children[0].value = "Изменённый вариант";
  get("variants-list").children[0].children[0].listeners.input();
  await get("btn-quick-import").click();
  assert.equal(imported.manual_title, "Солнечный фонарь");
  assert.equal(imported.use_gemini, false);
  assert.equal(imported.preserve_variant_names, true);
  assert.equal(imported.preserve_reviewed_data, true);
  assert.equal(imported.structured_data.variants.length, 600);
  assert.equal(imported.structured_data.variants[0].color, "Изменённый вариант");
  assert.equal(imported.structured_data.specifications[0].value, "Пластик");
  assert.equal(imported.structured_data.variants[599].sku_id, "sku-599");
  assert.equal(store[`importDraft:${source.original_link}`].payload.structured_data.variants.length, 600);
  assert.equal(JSON.stringify(imported).includes(personalKey), false);

  get("chat-message").value = "Улучши ещё";
  await get("btn-ai").click();
  get("manual-title").value = "Моя ручная правка";
  get("manual-title").listeners.input();
  await get("btn-apply-ai").click();
  assert.equal(get("manual-title").value, "Моя ручная правка");
  assert.match(get("status-box").textContent, /изменились после запроса/);
  await get("btn-remove-key").click();
  assert.equal(personalKey, "");
  assert.match(get("key-status").textContent, /ключ сервера/);
  get("ai-provider").value = "tokenplan";
  get("ai-provider").listeners.change();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(get("key-status").textContent, /Ключ TokenPlan не задан/);
  get("gemini-key").value = "tokenplan-test-key";
  await get("btn-save-key").click();
  assert.equal(tokenPlanKey, "tokenplan-test-key");
  assert.equal(get("gemini-key").value, "");
  assert.match(get("key-status").textContent, /Ключ TokenPlan сохранён/);
  await get("btn-ai-prepare").click();
  assert.equal(aiRequest.provider, "tokenplan");
  assert.equal(aiRequest.model, "gemini-3.8-flash");
  assert.match(aiRequest.instruction, /название/);
  assert.equal(JSON.stringify(aiRequest).includes(tokenPlanKey), false);
  await get("btn-remove-key").click();
  assert.equal(tokenPlanKey, "");
});
