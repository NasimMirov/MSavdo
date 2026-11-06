const DEFAULT_SERVER_URL = "http://127.0.0.1:3000";
const MARKETPLACE_DOMAINS = [
  "1688.com",
  "yangkeduo.com",
  "pinduoduo.com",
  "taobao.com",
  "tmall.com",
  "alibaba.com"
];

function getStoredServerUrl() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["serverUrl"], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result.serverUrl || DEFAULT_SERVER_URL);
    });
  });
}

function normalizeServerBase(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || "").trim());
  } catch {
    throw new Error("Укажите корректный URL сервера в настройках расширения.");
  }

  const isLoopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback))
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new Error("Для удалённого сервера требуется HTTPS; HTTP разрешён только для localhost.");
  }

  return url.href.replace(/\/+$/, "");
}

async function getServerUrl() {
  return normalizeServerBase(await getStoredServerUrl());
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      credentials: "omit",
      redirect: "error",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function isMarketplacePage(rawUrl) {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (MARKETPLACE_DOMAINS.some((domain) =>
      url.hostname === domain || url.hostname.endsWith(`.${domain}`)
    )) return true;

    const translatedSuffix = ".translate.goog";
    if (!url.hostname.endsWith(translatedSuffix)) return false;
    const translatedMarketplaceHost = url.hostname.slice(0, -translatedSuffix.length);
    return MARKETPLACE_DOMAINS.some((domain) => {
      const translatedDomain = domain.replace(/\./g, "-");
      return translatedMarketplaceHost === translatedDomain
        || translatedMarketplaceHost.endsWith(`-${translatedDomain}`);
    });
  } catch {
    return false;
  }
}

async function handleImportProduct(payload, sender) {
  const sourceUrl = sender.tab?.url || payload?.original_link;
  const fromExtensionPage = !sender.tab
    && typeof sender.url === "string"
    && sender.url.startsWith(chrome.runtime.getURL(""));
  if ((!sender.tab && !fromExtensionPage) || !isMarketplacePage(sourceUrl)) {
    return { success: false, error: "Импорт разрешён только со страниц поддерживаемых маркетплейсов." };
  }
  const rawText = typeof payload?.raw_text === "string"
    ? payload.raw_text
    : typeof payload?.raw_html_text === "string"
      ? payload.raw_html_text
      : null;
  if (!payload || typeof rawText !== "string") {
    return { success: false, error: "Страница не передала текст товара для импорта." };
  }
  if (rawText.length > 200000) {
    return { success: false, error: "Данные страницы слишком большие. Обновите страницу товара и повторите импорт." };
  }

  const images = (Array.isArray(payload.images) ? payload.images : [])
    .filter((url) => typeof url === "string" && url.length <= 2048)
    .slice(0, 50);
  const videoUrls = (Array.isArray(payload.video_urls) ? payload.video_urls : [])
    .filter((url) => typeof url === "string" && url.length <= 2048)
    .slice(0, 12);

  let structuredData = null;
  const sourceStructuredData = payload.structured_data;
  if (sourceStructuredData !== undefined && sourceStructuredData !== null) {
    if (typeof sourceStructuredData !== "object" || Array.isArray(sourceStructuredData)) {
      return { success: false, error: "Структурированные данные страницы имеют неверный формат." };
    }

    structuredData = {
      title: typeof sourceStructuredData.title === "string" ? sourceStructuredData.title.slice(0, 500) : "",
      category_hint: typeof sourceStructuredData.category_hint === "string"
        ? sourceStructuredData.category_hint.slice(0, 500)
        : "",
      title_candidates: (Array.isArray(sourceStructuredData.title_candidates) ? sourceStructuredData.title_candidates : [])
        .filter((title) => typeof title === "string")
        .slice(0, 5)
        .map((title) => title.slice(0, 500)),
      specifications: (Array.isArray(sourceStructuredData.specifications) ? sourceStructuredData.specifications : [])
        .filter((item) => item && typeof item.name === "string" && typeof item.value === "string")
        .slice(0, 100)
        .map((item) => ({ name: item.name.slice(0, 120), value: item.value.slice(0, 500) })),
      variants: (Array.isArray(sourceStructuredData.variants) ? sourceStructuredData.variants : [])
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          color: typeof item.color === "string" ? item.color.slice(0, 120) : "",
          size: typeof item.size === "string" ? item.size.slice(0, 120) : "",
          price_cny: Number.isFinite(Number(item.price_cny)) ? Number(item.price_cny) : 0,
          stock: Number.isFinite(Number(item.stock)) ? Number(item.stock) : 0,
          weight_kg: Number.isFinite(Number(item.weight_kg)) ? Number(item.weight_kg) : 0,
          image_url: typeof item.image_url === "string" ? item.image_url.slice(0, 2048) : "",
          sku_id: typeof item.sku_id === "string" ? item.sku_id.slice(0, 120) : "",
        })),
      images: (Array.isArray(sourceStructuredData.images) ? sourceStructuredData.images : [])
        .filter((url) => typeof url === "string" && url.length <= 2048)
        .slice(0, 32),
      video_urls: (Array.isArray(sourceStructuredData.video_urls) ? sourceStructuredData.video_urls : [])
        .filter((url) => typeof url === "string" && url.length <= 2048)
        .slice(0, 12),
      weight_kg: Number.isFinite(Number(sourceStructuredData.weight_kg))
        ? Number(sourceStructuredData.weight_kg)
        : 0,
    };
  }

  const visualSkuMap = (Array.isArray(payload.visual_sku_map) ? payload.visual_sku_map : [])
    .filter((item) => item && typeof item.raw_color === "string" && typeof item.image_url === "string" && item.image_url.length <= 2048)
    .slice(0, 12)
    .map((item) => ({ raw_color: item.raw_color.slice(0, 120), image_url: item.image_url }));
  const variantPrice = structuredData?.variants.find((variant) => variant.price_cny > 0)?.price_cny;
  const sourcePrice = typeof payload.price_cny === "number" || typeof payload.price_cny === "string"
    ? Number(payload.price_cny)
    : NaN;
  const priceCny = Number.isFinite(sourcePrice) && sourcePrice > 0
    ? sourcePrice
    : variantPrice;

  const endpoint = `${await getServerUrl()}/api/add-product`;
  try {
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        ...payload,
        raw_text: rawText,
        images,
        video_urls: Array.from(new Set([...videoUrls, ...(structuredData?.video_urls || [])])).slice(0, 12),
        visual_sku_map: visualSkuMap,
        price_cny: Number.isFinite(priceCny) ? priceCny : 0,
        structured_data: structuredData,
      })
    }, 45000);

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("Сервер вернул ответ не в формате JSON.");
    }

    const data = await response.json();
    if (!response.ok || data.status !== "success") {
      return {
        success: false,
        error: data.message || data.error || `Ошибка сервера: HTTP ${response.status}`
      };
    }
    return {
      success: true,
      serverUrl: endpoint,
      product: data.product,
      analysis_source: data.analysis_source,
      message: data.message || "Товар успешно импортирован"
    };
  } catch (error) {
    return {
      success: false,
      error: `Не удалось безопасно связаться с сервером ${endpoint}: ${error.message}`
    };
  }
}

async function handlePing(targetUrl) {
  const base = targetUrl ? normalizeServerBase(targetUrl) : await getServerUrl();
  try {
    const response = await fetchWithTimeout(`${base}/api/ping`, {
      method: "GET",
      headers: { "Accept": "application/json" }
    }, 4000);
    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.includes("application/json")) {
      return { success: true, url: base, data: await response.json() };
    }
    return { success: false, url: base, error: `Код ответа: ${response.status}` };
  } catch (error) {
    return { success: false, url: base, error: error.message };
  }
}

function requireExtensionPage(sender) {
  if (sender.tab || sender.url !== chrome.runtime.getURL("popup.html")) {
    throw new Error("Настройки ИИ доступны только из окна расширения.");
  }
}

async function getPrivateKeyStorage() {
  if (typeof chrome.storage.local.setAccessLevel !== "function") {
    throw new Error("Обновите Chrome: безопасное хранение ключа не поддерживается.");
  }
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  return chrome.storage.local;
}

async function handleKeySettings(action, key, sender) {
  requireExtensionPage(sender);
  const storage = await getPrivateKeyStorage();
  if (action === "saveGeminiKey") {
    if (typeof key !== "string" || !key.trim() || key.trim().length > 512 || /\s/.test(key.trim())) {
      throw new Error("Введите корректный ключ Gemini без пробелов.");
    }
    await storage.set({ geminiApiKey: key.trim() });
  } else if (action === "removeGeminiKey") {
    await storage.remove("geminiApiKey");
  }
  const stored = await storage.get("geminiApiKey");
  return { success: true, hasKey: Boolean(stored.geminiApiKey) };
}

async function generateWithPersonalKey(key, model, prepared, variantLabels) {
  if (!["gemini-3.5-flash-lite", "gemini-3.8-flash"].includes(model)) {
    throw new Error("Выберите поддерживаемую модель Gemini.");
  }
  if (!prepared || typeof prepared.prompt !== "string" || !Array.isArray(prepared.categories)) {
    throw new Error("Сервер не подготовил данные для Gemini. Обновите сервер M.Savdo.");
  }
  let response;
  try {
    response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prepared.prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }, 35000);
  } catch {
    throw new Error("Не удалось связаться с Google Gemini. Проверьте соединение и повторите.");
  }
  if (!response.ok) {
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new Error("Google отклонил запрос. Проверьте ключ, доступ к Gemini API и выбранную модель.");
    }
    if (response.status === 429) throw new Error("Лимит Gemini исчерпан. Проверьте квоту или замените ключ.");
    throw new Error(`Google Gemini вернул ошибку HTTP ${response.status}.`);
  }
  let proposal;
  try {
    const body = await response.json();
    const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
    proposal = JSON.parse(text);
  } catch {
    throw new Error("Gemini вернул некорректный ответ. Попробуйте ещё раз.");
  }
  if (!proposal || typeof proposal.reply !== "string" || !proposal.reply.trim() ||
      typeof proposal.title !== "string" || !proposal.title.trim() || proposal.title.length > 500 ||
      typeof proposal.description !== "string" || !proposal.description.trim() || proposal.description.length > 20000 ||
      typeof proposal.category_name !== "string" || !prepared.categories.includes(proposal.category_name) ||
      (variantLabels.length && (!Array.isArray(proposal.variant_labels) || proposal.variant_labels.length !== variantLabels.length ||
        proposal.variant_labels.some((item) => typeof item !== "string" || !item.trim() || item.length > 120)))) {
    throw new Error("Gemini вернул неполное предложение. Попробуйте ещё раз.");
  }
  return { success: true, data: {
    source: "gemini", model, reply: proposal.reply.trim().slice(0, 4000),
    proposal: {
      title: proposal.title.trim(), description: proposal.description.trim(),
      category_name: proposal.category_name, variant_labels: variantLabels.length ? proposal.variant_labels : [],
    },
  } };
}

async function handleImportAssistant(payload, sender) {
  requireExtensionPage(sender);
  const storage = typeof chrome.storage.local.setAccessLevel === "function"
    ? await getPrivateKeyStorage()
    : chrome.storage.local;
  const { geminiApiKey } = await storage.get("geminiApiKey");
  if (geminiApiKey && typeof storage.setAccessLevel !== "function") {
    throw new Error("Обновите Chrome: безопасное хранение ключа не поддерживается.");
  }
  const base = await getServerUrl();
  const target = new URL(base);
  const allowedOrigins = [target.origin];
  if (target.origin === "https://api.msavdo.shop") {
    allowedOrigins.push("https://msavdo.shop", "https://www.msavdo.shop");
  }
  if (["localhost", "127.0.0.1"].includes(target.hostname)) {
    allowedOrigins.push(`http://${target.hostname}:5173`);
  }
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find((candidate) => {
    try { return candidate.id && allowedOrigins.includes(new URL(candidate.url).origin); }
    catch { return false; }
  });
  if (!tab) {
    throw new Error("Откройте вкладку сайта M.Savdo и войдите в админку на выбранном сервере.");
  }
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    args: [base, allowedOrigins, geminiApiKey ? { ...payload, prepare_only: true } : payload],
    func: async (server, origins, data) => {
      if (!origins.includes(location.origin)) return { success: false, error: "Вкладка сайта изменилась. Повторите запрос." };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 40000);
      try {
        const response = await fetch(`${server}/api/admin/import-assistant`, {
          method: "POST",
          credentials: "include",
          redirect: "error",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) return { success: false, error: response.status === 401
          ? "Войдите в админку на выбранном сервере и повторите запрос."
          : body.error || `Ошибка сервера: HTTP ${response.status}` };
        return { success: true, data: body };
      } catch (error) {
        return { success: false, error: `Не удалось связаться с ИИ через вкладку сайта: ${error.message}` };
      } finally {
        clearTimeout(timeout);
      }
    },
  });
  const result = results[0]?.result || { success: false, error: "Вкладка сайта не ответила." };
  if (!result.success || !geminiApiKey) return result;
  return generateWithPersonalKey(geminiApiKey, payload.model, result.data, payload.variant_labels || []);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "importProduct") {
    handleImportProduct(request.payload, sender)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === "ping") {
    handlePing(request.url)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === "importAssistant") {
    handleImportAssistant(request.payload, sender)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (["getGeminiKeyStatus", "saveGeminiKey", "removeGeminiKey"].includes(request.action)) {
    handleKeySettings(request.action, request.key, sender)
      .then(sendResponse)
      .catch(() => sendResponse({ success: false, error: "Не удалось изменить настройки ключа. Проверьте ввод и поддержку безопасного хранения в Chrome." }));
    return true;
  }

  if (request.action === "getServerUrl") {
    getServerUrl()
      .then((serverUrl) => sendResponse({ serverUrl }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }
});
