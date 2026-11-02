(function () {
  "use strict";

  if (window.__MSAVDO_CONTENT_SCRIPT_LOADED__) return;
  window.__MSAVDO_CONTENT_SCRIPT_LOADED__ = true;

  const MODAL_ID = "msavdo-smart-import-modal";
  const MAX_TEXT_LENGTH = 6000;
  const MAX_IMAGES = 8;
  const MAX_VIDEOS = 12;
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

  function normalizeVideoUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) return "";
    const normalized = rawUrl
      .replace(/\\u002F/gi, "/")
      .replace(/\\\//g, "/")
      .replace(/&amp;/gi, "&")
      .trim();
    try {
      const url = new URL(normalized, document.baseURI);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      if (/\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i.test(url.href)) return "";
      return url.href;
    } catch {
      return "";
    }
  }

  function collectVideoUrls() {
    const videoUrls = new Set();
    const addUrl = (value) => {
      const url = normalizeVideoUrl(value);
      if (url) videoUrls.add(url);
    };

    for (const media of document.querySelectorAll("video, video source, [data-video-url]")) {
      addUrl(media.currentSrc || media.getAttribute("src") || media.getAttribute("data-video-url") || media.getAttribute("data-src"));
      if (videoUrls.size >= MAX_VIDEOS) return Array.from(videoUrls);
    }

    const visitVideoFields = (value, key = "", inVideoContext = false) => {
      const isVideoContext = inVideoContext || /video|playurl|mediaurl/i.test(key);
      if (typeof value === "string") {
        const isUrlField = /url|src|link|address|play/i.test(key);
        const looksLikeUrl = /^(?:https?:)?\/\//i.test(value) || /^\/[^/]/.test(value);
        if (isVideoContext && (isUrlField || looksLikeUrl) && !/poster|image|cover/i.test(key)) addUrl(value);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => visitVideoFields(item, key, isVideoContext));
      } else if (value && typeof value === "object") {
        Object.entries(value).forEach(([childKey, childValue]) => visitVideoFields(childValue, childKey, isVideoContext));
      }
    };

    for (const script of document.querySelectorAll("script:not([src])")) {
      if (videoUrls.size >= MAX_VIDEOS) break;
      const scriptText = script.textContent || "";
      if (scriptText.length > 250000 || !/video|playurl|mediaurl/i.test(scriptText)) continue;

      const assignmentMatch = scriptText.match(/(?:window\.(?:context|__INIT_DATA__|runParams)|__INITIAL_DATA__)\s*=\s*(\{[\s\S]*\});?\s*$/);
      const candidates = [assignmentMatch?.[1], scriptText.trim().startsWith("{") ? scriptText.trim() : ""];
      for (const candidate of candidates) {
        if (!candidate) continue;
        try {
          visitVideoFields(JSON.parse(candidate));
          if (videoUrls.size >= MAX_VIDEOS) break;
        } catch {
          const matches = scriptText.matchAll(/(?:videoUrl|playUrl|video_url|videoAddress|mediaUrl)\s*["']?\s*[:=]\s*["']([^"'\s]+)["']/gi);
          for (const match of matches) {
            addUrl(match[1]);
            if (videoUrls.size >= MAX_VIDEOS) break;
          }
        }
      }
    }

    return Array.from(videoUrls).slice(0, MAX_VIDEOS);
  }

  function parseInlineProductContext() {
    const scripts = document.querySelectorAll("script:not([src])");
    for (const script of scripts) {
      const source = script.textContent || "";
      if (source.length > 1000000 || !/skuInfoMap|featureAttributes|offerDetail/i.test(source)) continue;
      const assignment = /(?:window\.)?(?:context|__INIT_DATA__|runParams|__INITIAL_DATA__)\s*=/gi;
      let match;
      while ((match = assignment.exec(source)) !== null) {
        const afterAssignment = assignment.lastIndex;
        const wrapper = /\}\)\s*\(\s*[^,]+,\s*/g;
        wrapper.lastIndex = afterAssignment;
        const wrappedCall = wrapper.exec(source);
        const startSearch = wrappedCall ? wrapper.lastIndex : afterAssignment;
        const objectStart = source.indexOf("{", startSearch);
        if (objectStart < 0) continue;

        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let index = objectStart; index < source.length; index += 1) {
          const character = source[index];
          if (inString) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === '"') inString = false;
            continue;
          }
          if (character === '"') inString = true;
          else if (character === "{") depth += 1;
          else if (character === "}" && --depth === 0) {
            try {
              return JSON.parse(source.slice(objectStart, index + 1));
            } catch {
              break;
            }
          }
        }
      }
    }
    return null;
  }

  function getNestedObjects(root) {
    const objects = [];
    const seen = new Set();
    const visit = (value, depth) => {
      if (!value || typeof value !== "object" || depth > 30 || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, depth + 1));
        return;
      }
      objects.push(value);
      Object.values(value).forEach((item) => visit(item, depth + 1));
    };
    visit(root, 0);
    return objects;
  }

  function cleanStructuredText(value) {
    if (typeof value === "string" || typeof value === "number") {
      return String(value)
        .replace(/&gt;/gi, ">")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .trim();
    }
    if (Array.isArray(value)) return value.map(cleanStructuredText).filter(Boolean).join(" / ");
    if (value && typeof value === "object") {
      return cleanStructuredText(value.name ?? value.value ?? value.label ?? value.text);
    }
    return "";
  }

  function getStructuredNumber(value) {
    if (typeof value !== "string" && typeof value !== "number") return 0;
    const parsed = Number(String(value).replace(/[^\d.]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function extractStructuredProductData() {
    const root = parseInlineProductContext();
    if (!root) return null;

    const objects = getNestedObjects(root);
    const skuOwner = objects.find((item) => {
      const map = item.skuInfoMap || item.skuMap || item.sku?.skuInfoMap;
      return map && typeof map === "object" && !Array.isArray(map);
    });
    const offer = objects.find((item) => item.subject && (
      item.featureAttributes || item.productAttributes || item.skuInfoMap
    ));
    const firstField = (names) => {
      for (const name of names) {
        const owner = objects.find((item) => item[name] !== undefined && item[name] !== null && item[name] !== "");
        if (owner) return owner[name];
      }
      return undefined;
    };

    const title = cleanStructuredText(
      offer?.subject ?? firstField(["subject", "productTitle", "offerTitle", "title"])
    );
    const specifications = [];
    const seenSpecifications = new Set();
    for (const object of objects) {
      for (const field of ["featureAttributes", "productAttributes", "attributes"]) {
        if (!Array.isArray(object[field])) continue;
        for (const attribute of object[field]) {
          if (!attribute || typeof attribute !== "object") continue;
          const name = cleanStructuredText(attribute.name ?? attribute.attributeName ?? attribute.propName ?? attribute.label);
          const value = cleanStructuredText(attribute.value ?? attribute.attributeValue ?? attribute.propValue ?? attribute.values);
          if (!name || !value || seenSpecifications.has(name.toLowerCase())) continue;
          seenSpecifications.add(name.toLowerCase());
          specifications.push({ name, value });
          if (specifications.length >= 100) break;
        }
        if (specifications.length >= 100) break;
      }
      if (specifications.length >= 100) break;
    }

    const skuMap = skuOwner?.skuInfoMap || skuOwner?.skuMap || skuOwner?.sku?.skuInfoMap;
    const variants = [];
    if (skuMap && typeof skuMap === "object") {
      for (const [skuKey, rawSku] of Object.entries(skuMap)) {
        if (!rawSku || typeof rawSku !== "object") continue;
        const sku = rawSku;
        const attributes = cleanStructuredText(sku.specAttrs || skuKey)
          .split(/\s*(?:>|;|；|\|)\s*/)
          .filter(Boolean);
        const rawPrice = getStructuredNumber(sku.price ?? sku.discountPrice ?? sku.retailPrice);
        const rawStock = sku.canBookCount ?? sku.amountOnSale ?? sku.quantity ?? sku.stock;
        const stock = Number(rawStock);
        let imageUrl = normalizeImageUrl(sku.skuImageUrl || sku.picUrl || sku.imageUrl || "");
        variants.push({
          color: attributes[0] || cleanStructuredText(skuKey) || "Стандарт",
          size: attributes.slice(1).join(" / ") || "Стандарт",
          price_cny: rawPrice,
          stock: Number.isFinite(stock) && stock >= 0 ? Math.floor(stock) : 0,
          image_url: imageUrl,
          sku_id: cleanStructuredText(sku.skuId || sku.specId || ""),
        });
        if (variants.length >= 500) break;
      }
    }

    const images = new Set();
    const collectImages = (value, key = "", inImageContext = false) => {
      const imageContext = inImageContext || /image|pic|photo|main|gallery|img/i.test(key);
      if (typeof value === "string") {
        if (imageContext) {
          const url = normalizeImageUrl(value);
          if (url) images.add(url);
        }
      } else if (Array.isArray(value)) {
        value.forEach((item) => collectImages(item, key, imageContext));
      } else if (value && typeof value === "object") {
        Object.entries(value).forEach(([childKey, child]) => collectImages(child, childKey, imageContext));
      }
    };
    collectImages(root);

    const videoUrls = new Set(collectVideoUrls());
    const collectVideos = (value, key = "", inVideo = false) => {
      const videoContext = inVideo || /video|playurl|mediaurl/i.test(key);
      if (typeof value === "string") {
        if (videoContext && /url|src|link|address|play/i.test(key) && !/poster|image|cover/i.test(key)) {
          const url = normalizeVideoUrl(value);
          if (url) videoUrls.add(url);
        }
      } else if (Array.isArray(value)) {
        value.forEach((item) => collectVideos(item, key, videoContext));
      } else if (value && typeof value === "object") {
        Object.entries(value).forEach(([childKey, child]) => collectVideos(child, childKey, videoContext));
      }
    };
    collectVideos(root);

    const weight = getStructuredNumber(firstField(["unitWeight", "grossWeight", "weight", "productWeight", "netWeight"]));
    return {
      title,
      specifications,
      variants,
      images: Array.from(images).slice(0, 32),
      video_urls: Array.from(videoUrls).slice(0, MAX_VIDEOS),
      weight_kg: weight,
    };
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
    const structuredData = extractStructuredProductData();
    const structuredPrice = structuredData?.variants
      .map((variant) => variant.price_cny)
      .filter((price) => Number.isFinite(price) && price > 0)
      .sort((left, right) => left - right)[0];
    return {
      raw_text: rawText,
      raw_title: document.title || "",
      price_cny: getBasePrice(rawText) || structuredPrice || null,
      images: Array.from(new Set([
        ...(structuredData?.images || []),
        ...collectImages(),
      ])).slice(0, MAX_IMAGES),
      video_urls: Array.from(new Set([
        ...(structuredData?.video_urls || []),
        ...collectVideoUrls(),
      ])).slice(0, MAX_VIDEOS),
      original_link: window.location.href,
      visual_sku_map: collectVisualSkuMap().slice(0, MAX_IMAGES),
      structured_data: structuredData,
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
        ? `Цена: ¥${payload.price_cny} · Фото: ${payload.images.length} · Видео: ${payload.video_urls.length} · Цветов с фото: ${payload.visual_sku_map.length} · Текст страницы: ${payload.raw_text.length} символов`
        : `Цена в юанях не найдена · Фото: ${payload.images.length} · Видео: ${payload.video_urls.length} · Текст страницы: ${payload.raw_text.length} символов`;
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
