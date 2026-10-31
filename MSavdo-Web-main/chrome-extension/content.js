(function () {
  "use strict";

  if (window.__MSAVDO_CONTENT_SCRIPT_LOADED__) return;
  window.__MSAVDO_CONTENT_SCRIPT_LOADED__ = true;

  const MODAL_ID = "msavdo-smart-import-modal";
  const MAX_TEXT_LENGTH = 6000;
  const MAX_IMAGES = 8;
  const EXCLUDED_IMAGE_TOKENS = ["logo", "avatar", "qrcode", "qr-code", "banner", "icon"];

  function getElementText(element) {
    const copy = element.cloneNode(true);
    for (const node of copy.querySelectorAll("script, style, noscript")) {
      node.remove();
    }

    return (copy.innerText || copy.textContent || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]*\n(?:[ \t]*\n)*/g, "\n\n")
      .trim();
  }

  function getPageText() {
    if (!document.body) return "";

    const textParts = [];
    const seen = new Set();
    let textLength = 0;
    const appendText = (text) => {
      const normalized = String(text || "").trim();
      if (!normalized || seen.has(normalized) || textLength >= MAX_TEXT_LENGTH) return;
      seen.add(normalized);
      const separatorLength = textParts.length > 0 ? 2 : 0;
      const remainingLength = MAX_TEXT_LENGTH - textLength - separatorLength;
      if (remainingLength <= 0) return;
      const part = normalized.slice(0, remainingLength);
      textParts.push(part);
      textLength += separatorLength + part.length;
    };

    appendText(document.querySelector("h1")?.innerText);
    appendText(document.querySelector('meta[property="og:title"]')?.content);
    appendText(document.title);

    const textLengthBeforeProductData = textLength;
    const productDataSelectors = [
      '[class*="price" i]',
      '[id*="price" i]',
      '[class*="attribute" i]',
      '[id*="attribute" i]',
      '[class*="spec" i]',
      '[id*="spec" i]',
      '[class*="parameter" i]',
      '[id*="parameter" i]',
      '[class*="property" i]',
      '[id*="property" i]',
      "table",
      "dl",
    ];

    for (const selector of productDataSelectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (element.closest("footer, nav, aside")) continue;
        appendText(getElementText(element));
        if (textLength >= MAX_TEXT_LENGTH) break;
      }
      if (textLength >= MAX_TEXT_LENGTH) break;
    }

    if (textLength === textLengthBeforeProductData) {
      const mainContent = document.querySelector("main, article, [role='main']");
      if (mainContent) appendText(getElementText(mainContent));
    }

    return textParts.join("\n\n");
  }

  function getBasePrice(text) {
    const prices = [];
    const pricePattern = /(?:[¥￥]\s*(\d{1,7}(?:\.\d{1,2})?)|(\d{1,7}(?:\.\d{1,2})?)\s*(?:元|人民币))/g;
    let match;

    while ((match = pricePattern.exec(text)) !== null) {
      const price = Number(match[1] || match[2]);
      if (Number.isFinite(price) && price > 0 && price <= 100000) {
        prices.push(price);
      }
    }

    return prices.length > 0 ? Math.min(...prices) : null;
  }

  function normalizeImageUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) return "";

    try {
      const url = new URL(rawUrl.trim(), document.baseURI);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      const lowerUrl = url.href.toLowerCase();
      for (const token of EXCLUDED_IMAGE_TOKENS) {
        if (lowerUrl.includes(token)) return "";
      }
      return url.href;
    } catch {
      return "";
    }
  }

  function getImageUrl(image) {
    const attributes = ["data-zoom-image", "data-original", "data-large", "data-src", "src"];
    for (const attribute of attributes.slice(0, -1)) {
      const url = normalizeImageUrl(image.getAttribute(attribute));
      if (url) return url;
    }
    return normalizeImageUrl(image.currentSrc || image.getAttribute("src"));
  }

  function collectImages() {
    const imageUrls = new Set();
    for (const image of document.querySelectorAll("img")) {
      const url = getImageUrl(image);
      const width = Math.max(image.naturalWidth || 0, Number(image.getAttribute("width")) || 0);
      const height = Math.max(image.naturalHeight || 0, Number(image.getAttribute("height")) || 0);
      if (url && width >= 160 && height >= 160) {
        imageUrls.add(url);
      }
      if (imageUrls.size >= MAX_IMAGES) break;
    }

    const ogImage = document.querySelector('meta[property="og:image"]');
    if (imageUrls.size < MAX_IMAGES && ogImage) {
      const url = normalizeImageUrl(ogImage.content);
      if (url) imageUrls.add(url);
    }

    return Array.from(imageUrls).slice(0, MAX_IMAGES);
  }

  function getChineseLabel(element) {
    const candidates = [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-color"),
      element.getAttribute("alt"),
      element.textContent,
    ];

    for (const candidate of candidates) {
      const label = String(candidate || "").replace(/\s+/g, " ").trim();
      if (!label || label.length > 100) continue;
      const chineseText = label.match(/[\u3400-\u9fff]{1,20}/g);
      if (chineseText && chineseText.length > 0) return chineseText.join("");
    }
    return "";
  }

  function findControlImage(control) {
    let current = control;
    for (let depth = 0; current && depth < 4; depth += 1) {
      const images = current.querySelectorAll("img");
      if (images.length === 1) {
        const image = images[0];
        const url = getImageUrl(image);
        if (url) return url;
      }
      if (images.length > 1) return "";
      current = current.parentElement;
    }
    return "";
  }

  function collectVisualSkuMap() {
    const seen = new Set();
    const result = [];
    const controls = document.querySelectorAll(
      'button, label, [role="radio"], [role="option"], [aria-label], [data-color]'
    );

    for (const control of controls) {
      if (result.length >= MAX_IMAGES) break;
      const rawColor = getChineseLabel(control);
      if (!rawColor || seen.has(rawColor)) continue;
      const imageUrl = findControlImage(control);
      if (!imageUrl) continue;
      seen.add(rawColor);
      result.push({ raw_color: rawColor, image_url: imageUrl });
    }

    return result;
  }

  function gatherProductData() {
    const rawText = getPageText();
    return {
      raw_text: rawText,
      raw_title: document.title || "",
      price_cny: getBasePrice(rawText),
      images: collectImages(),
      original_link: window.location.href,
      visual_sku_map: collectVisualSkuMap().slice(0, MAX_IMAGES),
      use_gemini: true,
    };
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function showImporterModal() {
    const previousModal = document.getElementById(MODAL_ID);
    if (previousModal) previousModal.remove();

    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
      background: "rgba(15, 23, 42, 0.78)",
      fontFamily: "Arial, sans-serif",
    });

    const panel = document.createElement("section");
    Object.assign(panel.style, {
      width: "min(520px, 100%)",
      padding: "24px",
      borderRadius: "18px",
      background: "#fff",
      color: "#0f172a",
      boxShadow: "0 20px 60px rgba(0,0,0,.35)",
    });

    const title = document.createElement("h2");
    title.textContent = "M.Savdo — Умный ИИ Импорт";
    Object.assign(title.style, { margin: "0 0 10px", fontSize: "20px" });

    const summary = document.createElement("p");
    summary.textContent = "Подготовка текста страницы, цены и фотографий…";
    Object.assign(summary.style, { margin: "0 0 18px", color: "#475569" });

    const disclosure = document.createElement("p");
    disclosure.textContent = "После нажатия кнопки текст страницы, цена и ссылки на фотографии будут отправлены на сервер, указанный в настройках расширения.";
    Object.assign(disclosure.style, { margin: "0 0 14px", color: "#64748b", fontSize: "12px" });

    const status = document.createElement("p");
    Object.assign(status.style, { minHeight: "20px", margin: "0 0 16px", fontSize: "13px" });

    const buttons = document.createElement("div");
    Object.assign(buttons.style, { display: "flex", justifyContent: "flex-end", gap: "10px" });

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Закрыть";
    Object.assign(closeButton.style, { padding: "10px 14px", border: "0", borderRadius: "9px", background: "#e2e8f0", cursor: "pointer" });

    const submitButton = document.createElement("button");
    submitButton.type = "button";
    submitButton.disabled = true;
    submitButton.textContent = "Умный ИИ Импорт";
    Object.assign(submitButton.style, { padding: "10px 16px", border: "0", borderRadius: "9px", background: "#111827", color: "#fff", fontWeight: "700", cursor: "pointer" });

    buttons.append(closeButton, submitButton);
    panel.append(title, summary, disclosure, status, buttons);
    overlay.appendChild(panel);
    (document.body || document.documentElement).appendChild(overlay);

    let payload = null;
    closeButton.addEventListener("click", () => overlay.remove());
    submitButton.addEventListener("click", async () => {
      if (!payload || !Number.isFinite(payload.price_cny)) {
        status.style.color = "#b91c1c";
        status.textContent = "На странице не найдена цена в юанях. Импорт остановлен, чтобы не подставлять цену.";
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = "Отправка данных…";
      status.textContent = "";
      try {
        const response = await sendRuntimeMessage({ action: "importProduct", payload });
        if (!response || !response.success) {
          throw new Error(response?.error || "Сервер не сохранил товар");
        }
        status.style.color = "#047857";
        status.textContent = `Товар импортирован: ${response.product?.title || "успешно"}`;
        submitButton.textContent = "Импорт завершён";
      } catch (error) {
        status.style.color = "#b91c1c";
        status.textContent = `Ошибка импорта: ${error.message}`;
        submitButton.disabled = false;
        submitButton.textContent = "Повторить импорт";
      }
    });

    try {
      payload = gatherProductData();
      summary.textContent = Number.isFinite(payload.price_cny)
        ? `Цена: ¥${payload.price_cny} · Фото: ${payload.images.length} · Цветов с фото: ${payload.visual_sku_map.length} · Текст страницы: ${payload.raw_text.length} символов`
        : `Цена в юанях не найдена · Фото: ${payload.images.length} · Текст страницы: ${payload.raw_text.length} символов`;
      submitButton.disabled = !Number.isFinite(payload.price_cny);
      if (!Number.isFinite(payload.price_cny)) {
        status.style.color = "#b91c1c";
        status.textContent = "Импорт недоступен без распознанной цены в юанях.";
      }
    } catch (error) {
      summary.textContent = `Не удалось собрать данные страницы: ${error.message}`;
    }
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === "openImporterModal" || request.action === "triggerImport") {
      showImporterModal();
      sendResponse({ success: true, message: "Импортёр открыт" });
      return false;
    }

    if (request.action === "gatherProductData") {
      try {
        sendResponse({ success: true, payload: gatherProductData() });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      return false;
    }
    return false;
  });
})();
