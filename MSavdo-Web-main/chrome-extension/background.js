// background.js — Service Worker расширения M.Savdo (Manifest V3)
// Высокоскоростная интеллектуальная маршрутизация между портами 5000 (Python Flask), 3000 (Node.js) и облаком

const CLOUD_APP_URL = "https://ais-dev-ahmyq45nmycvpjtbn4woji-541461425934.asia-northeast1.run.app";
const DEFAULT_SERVER_URL = "http://127.0.0.1:3000";

async function getServerUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["serverUrl"], (result) => {
      resolve(result.serverUrl || DEFAULT_SERVER_URL);
    });
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      credentials: "include",
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function handleImportProduct(payload) {
  const configuredUrl = await getServerUrl();
  const cleanBase = (configuredUrl || "").replace(/\/+$/, "");

  // Быстрый перебор серверов: пользовательский URL -> Node (3000) -> Flask (5000) -> Cloud
  const candidates = [
    cleanBase ? `${cleanBase}/api/add-product` : null,
    "http://127.0.0.1:3000/api/add-product",
    "http://localhost:3000/api/add-product",
    "http://127.0.0.1:5000/api/add-product",
    "http://localhost:5000/api/add-product",
    `${CLOUD_APP_URL}/api/add-product`
  ].filter(Boolean);

  const uniqueUrls = Array.from(new Set(candidates));
  let errorsList = [];

  for (const url of uniqueUrls) {
    try {
      console.log("[M.Savdo Background] Отправка на:", url);
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      }, 12000);

      // Проверяем, что ответ — JSON, а не HTML страница перенаправления
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("json")) {
        const text = await res.text();
        console.warn(`[M.Savdo Background] Сервер ${url} вернул HTML вместо JSON`);
        errorsList.push(`${url}: возвращена веб-страница вместо API`);
        continue;
      }

      if (res.ok) {
        const data = await res.json();
        if (data.status === "success") {
          console.log("[M.Savdo Background] ✓ Успешно сохранено на:", url);
          // Сохраняем рабочий адрес как дефолтный
          const workingBase = url.replace(/\/api\/add-product$/, "");
          chrome.storage.local.set({ serverUrl: workingBase });

          return {
            success: true,
            serverUrl: url,
            product: data.product,
            message: data.message || "Товар успешно импортирован"
          };
        } else {
          return {
            success: false,
            error: data.message || "Ошибка API M.Savdo"
          };
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        errorsList.push(`${url}: HTTP ${res.status} (${errJson.message || errJson.error || 'Ошибка'})`);
      }
    } catch (err) {
      console.warn(`[M.Savdo Background] Ошибка связи с ${url}:`, err.message);
      errorsList.push(`${url}: ${err.message}`);
    }
  }

  return {
    success: false,
    error: `Не удалось связаться с сервером M.Savdo.\nПроверенные адреса:\n• ${errorsList.join('\n• ')}\n\nУбедитесь, что запущен app.py (порт 5000) или Node сервер (порт 3000), либо скопируйте JSON товара вручную.`
  };
}

async function handlePing(targetUrl) {
  const base = (targetUrl || await getServerUrl()).replace(/\/+$/, "");
  try {
    const res = await fetchWithTimeout(`${base}/api/ping`, {
      method: "GET",
      headers: { "Accept": "application/json" }
    }, 4000);
    const contentType = res.headers.get("content-type") || "";
    if (res.ok && contentType.includes("json")) {
      const data = await res.json();
      return { success: true, url: base, data };
    }
    return { success: false, url: base, error: `Код ответа: ${res.status}` };
  } catch (err) {
    return { success: false, url: base, error: err.message };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "importProduct") {
    handleImportProduct(request.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "ping") {
    handlePing(request.url)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "getServerUrl") {
    getServerUrl().then((url) => sendResponse({ serverUrl: url }));
    return true;
  }
});
