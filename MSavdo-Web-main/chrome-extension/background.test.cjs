const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createWorker(options = {}) {
  const store = { serverUrl: "https://api.msavdo.shop" };
  const calls = { scripts: [], fetches: [], accessLevels: [] };
  const popup = { url: "chrome-extension://test/popup.html" };
  let listener;
  let status = 200;
  let body = {
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      reply: "Готово", title: "Фонарь", description: "Описание", category_name: "Товары",
      variant_labels: ["Красный"],
    }) }] } }],
  };
  let scriptResult = { success: true, data: { prompt: "Текст товара", categories: ["Товары"] } };
  const storage = {
    async setAccessLevel(value) { calls.accessLevels.push(value.accessLevel); },
    get(keys, callback) {
      const result = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) result[key] = store[key];
      if (callback) { callback(result); return; }
      return Promise.resolve(result);
    },
    async set(value) { Object.assign(store, value); },
    async remove(key) { delete store[key]; },
  };
  if (options.noAccessLevel) delete storage.setAccessLevel;
  const chrome = {
    storage: { local: storage },
    runtime: {
      getURL: (file) => `chrome-extension://test/${file}`,
      onMessage: { addListener(fn) { listener = fn; } },
    },
    tabs: { query: async () => [{ id: 1, url: "https://api.msavdo.shop/admin" }] },
    scripting: { executeScript: async (args) => { calls.scripts.push(args); return [{ result: scriptResult }]; } },
  };
  const context = {
    chrome, URL, AbortController, setTimeout, clearTimeout, console,
    fetch: async (url, options) => {
      calls.fetches.push({ url, options });
      if (url.endsWith("/api/import-categories")) {
        return { ok: true, status: 200, json: async () => ({ categories: ["Товары"] }) };
      }
      return { ok: status >= 200 && status < 300, status, json: async () => body };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "background.js"), "utf8"), context);
  return {
    calls, store, popup,
    setStatus(value) { status = value; },
    setBody(value) { body = value; },
    setScriptResult(value) { scriptResult = value; },
    send(request, sender = popup) {
      return new Promise((resolve, reject) => {
        const asyncResponse = listener(request, sender, resolve);
        if (asyncResponse !== true) reject(new Error("No asynchronous response"));
      });

    },
  };
}

const payload = {
  title: "Фонарь", description: "", source_text: "", instruction: "Переведи", history: [],
  model: "gemini-3.5-flash-lite", variant_labels: ["红色"],
};

test("TokenPlan uses its own key and model without a logged-in tab", async () => {
  const worker = createWorker();
  const denied = await worker.send({ action: "saveTokenPlanKey", key: "secret-tokenplan-key" }, {
    url: "https://1688.com/", tab: { id: 2 },
  });
  assert.equal(denied.success, false);
  assert.equal((await worker.send({ action: "saveTokenPlanKey", key: "secret-tokenplan-key" })).hasKey, true);
  assert.equal((await worker.send({ action: "getTokenPlanKeyStatus" })).hasKey, true);
  worker.setBody({ choices: [{ message: { content: '```json\n' + JSON.stringify({
    reply: "Готово", title: "Фонарь", description: "Описание", category_name: "Товары",
    variant_labels: ["Красный"],
  }) + '\n```' } }] });
  const input = { ...payload, provider: "tokenplan", model: "gemini-3.8-flash" };
  const result = await worker.send({ action: "importAssistant", payload: input });
  assert.equal(result.success, true);
  assert.equal(result.data.proposal.variant_labels[0], "Красный");
  assert.equal(worker.calls.scripts.length, 0);
  const request = worker.calls.fetches[1];
  assert.equal(request.url, "https://tokenplan.lat/v1/chat/completions");
  assert.equal(request.options.headers.Authorization, `Bearer ${worker.store.tokenPlanApiKey}`);
  assert.equal(request.options.credentials, "omit");
  assert.equal(request.options.redirect, "error");
  assert.equal(request.options.body.includes("secret-tokenplan-key"), false);
  assert.equal(worker.calls.fetches[0].options.headers.Authorization, undefined);
  assert.equal(JSON.stringify(result).includes("secret-tokenplan-key"), false);
  worker.setStatus(429);
  const error = await worker.send({ action: "importAssistant", payload: input });
  assert.equal(error.success, false);
  assert.match(error.error, /лимит/i);
  assert.equal(worker.calls.scripts.length, 0);
  assert.equal(JSON.stringify(error).includes("secret-tokenplan-key"), false);
  await worker.send({ action: "removeTokenPlanKey" });
  const missing = await worker.send({ action: "importAssistant", payload: input });
  assert.equal(missing.success, false);
  assert.match(missing.error, /ключ TokenPlan/i);
});

test("personal key stays in trusted storage and is used only for direct Google requests", async () => {
  const worker = createWorker();
  const save = await worker.send({ action: "saveGeminiKey", key: "secret-test-key" });
  assert.equal(save.success, true);
  assert.equal(save.hasKey, true);
  assert.equal(JSON.stringify(save).includes("secret-test-key"), false);
  assert.deepEqual(worker.calls.accessLevels, ["TRUSTED_CONTEXTS"]);

  const denied = await worker.send({ action: "getGeminiKeyStatus" }, {
    url: "https://1688.com/", tab: { id: 2 },
  });
  assert.equal(denied.success, false);
  const deniedUse = await worker.send({ action: "importAssistant", payload }, {
    url: "https://1688.com/", tab: { id: 2 },
  });
  assert.equal(deniedUse.success, false);
  assert.equal(worker.calls.scripts.length, 0);

  const result = await worker.send({ action: "importAssistant", payload });
  assert.equal(result.success, true);
  assert.equal(result.data.proposal.variant_labels[0], "Красный");
  assert.equal(worker.calls.scripts[0].args[2].prepare_only, true);
  assert.equal(JSON.stringify(worker.calls.scripts[0]).includes("secret-test-key"), false);
  assert.equal(worker.calls.fetches.length, 1);
  const request = worker.calls.fetches[0];
  assert.equal(request.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
  assert.equal(request.options.headers["x-goog-api-key"], "secret-test-key");
  assert.equal(request.options.credentials, "omit");
  assert.equal(request.options.redirect, "error");
  assert.equal(request.options.body.includes("secret-test-key"), false);
  assert.equal(JSON.stringify(result).includes("secret-test-key"), false);

  await worker.send({ action: "saveGeminiKey", key: "replacement-key" });
  await worker.send({ action: "importAssistant", payload });
  assert.equal(worker.calls.fetches[1].options.headers["x-goog-api-key"], "replacement-key");
  await worker.send({ action: "removeGeminiKey" });
  assert.equal(worker.store.geminiApiKey, undefined);
  worker.setScriptResult({ success: true, data: { source: "gemini", reply: "Сервер" } });
  const serverResult = await worker.send({ action: "importAssistant", payload });
  assert.equal(serverResult.data.reply, "Сервер");
  assert.equal(worker.calls.scripts[2].args[2].prepare_only, undefined);
  assert.equal(worker.calls.fetches.length, 2);
});

test("personal key errors never fall back to server or reveal credentials", async () => {
  const worker = createWorker();
  await worker.send({ action: "saveGeminiKey", key: "secret-test-key" });
  for (const status of [400, 401, 403, 429, 500]) {
    worker.setStatus(status);
    worker.setBody({ error: { message: "secret-test-key" } });
    const result = await worker.send({ action: "importAssistant", payload });
    assert.equal(result.success, false);
    assert.equal(JSON.stringify(result).includes("secret-test-key"), false);
    assert.equal(worker.calls.scripts.at(-1).args[2].prepare_only, true);
    if (status === 429) assert.match(result.error, /лимит/i);
  }
  worker.setStatus(200);
  worker.setBody({ candidates: [{ content: { parts: [{ text: '{"reply":"bad"}' }] } }] });
  const invalid = await worker.send({ action: "importAssistant", payload });
  assert.equal(invalid.success, false);
  assert.match(invalid.error, /неполное/i);
  worker.setScriptResult({ success: false, error: "Войдите в админку" });
  const count = worker.calls.fetches.length;
  const unauthorized = await worker.send({ action: "importAssistant", payload });
  assert.equal(unauthorized.success, false);
  assert.equal(worker.calls.fetches.length, count);
});

test("server mode remains available when private storage is not supported", async () => {
  const worker = createWorker({ noAccessLevel: true });
  worker.setScriptResult({ success: true, data: { reply: "Сервер" } });
  const settings = await worker.send({ action: "saveGeminiKey", key: "secret-test-key" });
  assert.equal(settings.success, false);
  assert.equal(worker.store.geminiApiKey, undefined);
  const result = await worker.send({ action: "importAssistant", payload });
  assert.equal(result.success, true);
  assert.equal(result.data.reply, "Сервер");
  assert.equal(worker.calls.fetches.length, 0);
});
