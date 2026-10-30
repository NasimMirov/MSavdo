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
    return MARKETPLACE_DOMAINS.some((domain) =>
      url.hostname === domain || url.hostname.endsWith(`.${domain}`)
    );
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
  const images = Array.isArray(payload?.images) ? payload.images : [];
  if (
    !payload
    || typeof rawText !== "string"
    || rawText.length > 200000
    || images.length > 50
    || !Number.isFinite(payload.price_cny)
  ) {
    return { success: false, error: "Данные товара неполные или превышают допустимый размер." };
  }

  const endpoint = `${await getServerUrl()}/api/add-product`;
  try {
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ ...payload, raw_text: rawText, images })
    });

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

  if (request.action === "getServerUrl") {
    getServerUrl()
      .then((serverUrl) => sendResponse({ serverUrl }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }
});
