// M.Savdo content script: collect marketplace text, product images, and visual SKU data.
(function () {
  "use strict";

  if (window.__MSAVDO_CONTENT_SCRIPT_LOADED__) return;
  window.__MSAVDO_CONTENT_SCRIPT_LOADED__ = true;

  const MODAL_ID = "msavdo-smart-import-modal";
  const EXCLUDED_IMAGE_TOKENS = ["logo", "avatar", "qrcode", "banner"];
  const COLOR_MARKERS = /黑|白|灰|蓝|紅|红|粉|黄|绿|綠|棕|咖|米|紫|橙|金|银|銀|青|卡其|酒红|酒紅|藏青|军绿|軍綠|透明|香槟|拼色|多色/;

  function extractCleanTextLayer() {
    const body = document.body;
    if (!body) return "";

    const bodyText = body.innerText || "";
    const clone = body.cloneNode(true);
    for (const node of clone.querySelectorAll("script, style, #msavdo-smart-import-modal")) {
      node.remove();
    }

    return (clone.innerText || clone.textContent || bodyText)
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]*\n(?:[ \t]*\n)*/g, "\n\n")
      .trim();
  }

  function extractBasePriceCny(text) {
    let lowestPrice = Infinity;
    const pricePattern = /(?:[¥￥]\s*(\d{1,7}(?:\.\d{1,2})?)|(\d{1,7}(?:\.\d{1,2})?)\s*(?:元|人民币))/g;
    let match;

    while ((match = pricePattern.exec(text)) !== null) {
      const value = Number(match[1] || match[2]);
      if (Number.isFinite(value) && value >= 0.01 && value <= 100000) {
        lowestPrice = Math.min(lowestPrice, value);
      }
    }

    if (!Number.isFinite(lowestPrice)) return 50;
    return Number(lowestPrice.toFixed(2));
  }

  function isExcludedImageUrl(url) {
    const lowerUrl = String(url || "").toLowerCase();
    for (const token of EXCLUDED_IMAGE_TOKENS) {
      if (lowerUrl.includes(token)) return true;
    }
    return false;
  }

  function normalizeImageUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return "";

    try {
      const parsed = new URL(rawUrl.trim(), document.baseURI);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";

      parsed.pathname = parsed.pathname
        .replace(/(\.(?:jpe?g|png|webp))_\d+x\d+(?:q\d+)?\.(?:jpe?g|png|webp)$/i, "$1")
        .replace(/_\d+x\d+(?:q\d+)?(?=\.(?:jpe?g|png|webp)$)/i, "");

      const normalized = parsed.href;
      if (isExcludedImageUrl(normalized)) return "";
      return normalized;
    } catch (_) {
      return "";
    }
  }

  function getSrcsetCandidates(srcset) {
    if (!srcset) return [];

    const candidates = [];
    for (const item of srcset.split(",")) {
      const parts = item.trim().split(/\s+/);
      if (!parts[0]) continue;
      const widthMatch = parts[1] ? parts[1].match(/^(\d+)w$/) : null;
      candidates.push({
        url: parts[0],
        width: widthMatch ? Number(widthMatch[1]) : 0,
      });
    }

    candidates.sort((left, right) => right.width - left.width);
    return candidates;
  }

  function getImageUrlFromElement(element) {
    if (!element) return "";

    const preferredAttributes = [
      "data-zoom-image",
      "data-original",
      "data-large",
      "data-image",
      "data-img",
      "data-lazy-src",
      "data-src",
    ];

    for (const attribute of preferredAttributes) {
      const value = element.getAttribute(attribute);
      if (value) {
        const normalized = normalizeImageUrl(value);
        if (normalized) return normalized;
      }
    }

    const srcsetCandidates = getSrcsetCandidates(element.getAttribute("srcset"));
    for (const candidate of srcsetCandidates) {
      const normalized = normalizeImageUrl(candidate.url);
      if (normalized) return normalized;
    }

    if (element instanceof HTMLImageElement && element.currentSrc) {
      const currentSource = normalizeImageUrl(element.currentSrc);
      if (currentSource) return currentSource;
    }

    return normalizeImageUrl(element.getAttribute("src") || "");
  }

  function getImageCandidates() {
    const candidates = new Map();
    const imageElements = document.querySelectorAll("img");

    for (const image of imageElements) {
      const url = getImageUrlFromElement(image);
      if (!url) continue;

      const srcsetCandidates = getSrcsetCandidates(image.getAttribute("srcset"));
      let rawSourceUrl = image.currentSrc || image.getAttribute("src") || "";
      for (const candidate of srcsetCandidates) {
        const candidateUrl = normalizeImageUrl(candidate.url);
        if (candidateUrl === url) {
          rawSourceUrl = candidate.url;
          break;
        }
      }

      candidates.set(url, {
        url,
        naturalWidth: image.naturalWidth || 0,
        naturalHeight: image.naturalHeight || 0,
        sourceUrl: normalizeImageUrl(rawSourceUrl),
      });
    }

    const openGraphImage = document.querySelector('meta[property="og:image"]');
    if (openGraphImage) {
      const url = normalizeImageUrl(openGraphImage.content);
      if (url && !candidates.has(url)) {
        candidates.set(url, { url, naturalWidth: 0, naturalHeight: 0, sourceUrl: "" });
      }
    }

    return candidates;
  }

  function measureImage(url) {
    return new Promise((resolve) => {
      const image = new Image();
      const timeout = window.setTimeout(() => {
        image.onload = null;
        image.onerror = null;
        resolve({ width: 0, height: 0 });
      }, 4000);

      image.onload = () => {
        window.clearTimeout(timeout);
        resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
      };
      image.onerror = () => {
        window.clearTimeout(timeout);
        resolve({ width: 0, height: 0 });
      };
      image.src = url;
    });
  }

  async function keepHighQualityImages(imageCandidates) {
    const candidates = Array.from(imageCandidates.values());
    const accepted = [];
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < candidates.length) {
        const candidate = candidates[nextIndex];
        nextIndex += 1;

        let dimensions = { width: candidate.naturalWidth, height: candidate.naturalHeight };
        if (
          !dimensions.width ||
          !dimensions.height ||
          (candidate.sourceUrl && candidate.sourceUrl !== candidate.url)
        ) {
          dimensions = await measureImage(candidate.url);
        }

        if (dimensions.width >= 300 && dimensions.height >= 300) {
          accepted.push(candidate.url);
        }
      }
    }

    const workerCount = Math.min(8, candidates.length);
    const workers = [];
    for (let index = 0; index < workerCount; index += 1) {
      workers.push(worker());
    }
    await Promise.all(workers);
    return accepted;
  }

  function getColorLabel(element) {
    if (!element) return "";

    const labelParts = [
      element.getAttribute("title"),
      element.getAttribute("aria-label"),
      element.getAttribute("data-color"),
      element.getAttribute("alt"),
      element.textContent,
    ];

    for (const part of labelParts) {
      const text = String(part || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 80 || !COLOR_MARKERS.test(text)) continue;

      const chineseParts = text.match(/[\u3400-\u9fff]{1,16}/g) || [];
      for (const chinesePart of chineseParts) {
        if (COLOR_MARKERS.test(chinesePart)) return chinesePart;
      }
    }

    return "";
  }

  function getBackgroundImageUrl(element) {
    try {
      const backgroundImage = window.getComputedStyle(element).backgroundImage;
      const match = backgroundImage.match(/url\((["']?)(.*?)\1\)/i);
      return match ? normalizeImageUrl(match[2]) : "";
    } catch (_) {
      return "";
    }
  }

  function getAssociatedImageUrl(container, sourceImage) {
    const containerUrl = getImageUrlFromElement(container);
    if (containerUrl) return containerUrl;

    if (sourceImage) {
      const imageUrl = getImageUrlFromElement(sourceImage);
      if (imageUrl) return imageUrl;
    }

    const imageElements = container.querySelectorAll("img");
    for (const image of imageElements) {
      const imageUrl = getImageUrlFromElement(image);
      if (imageUrl) return imageUrl;
    }

    return getBackgroundImageUrl(container);
  }

  function extractVisualSkuMap() {
    const visualSkuMap = [];
    const seenColors = new Set();
    const images = document.querySelectorAll("img");

    for (const image of images) {
      let container = image.parentElement;
      let depth = 0;

      while (container && depth < 6) {
        const rawColor = getColorLabel(container);
        if (rawColor) {
          const imageUrl = getAssociatedImageUrl(container, image);
          if (imageUrl && !seenColors.has(rawColor)) {
            seenColors.add(rawColor);
            visualSkuMap.push({ raw_color: rawColor, image_url: imageUrl });
          }
          break;
        }
        container = container.parentElement;
        depth += 1;
      }
    }

    const controls = document.querySelectorAll(
      'button, [role="button"], [role="radio"], [role="option"], [aria-pressed], [aria-selected], label, a, [data-image], [data-img], [data-color]'
    );
    for (const control of controls) {
      const rawColor = getColorLabel(control);
      if (!rawColor || seenColors.has(rawColor)) continue;

      const imageUrl = getAssociatedImageUrl(control, null);
      if (imageUrl) {
        seenColors.add(rawColor);
        visualSkuMap.push({ raw_color: rawColor, image_url: imageUrl });
      }
    }

    return visualSkuMap;
  }

  async function gatherProductData() {
    const rawHtmlText = extractCleanTextLayer();
    const imageCandidates = getImageCandidates();
    const visualSkuMap = extractVisualSkuMap();

    for (const item of visualSkuMap) {
      if (!imageCandidates.has(item.image_url)) {
        imageCandidates.set(item.image_url, {
          url: item.image_url,
          naturalWidth: 0,
          naturalHeight: 0,
          sourceUrl: "",
        });
      }
    }

    const images = await keepHighQualityImages(imageCandidates);
    const highQualityImages = new Set(images);
    const highQualitySkuMap = [];
    for (const item of visualSkuMap) {
      if (highQualityImages.has(item.image_url)) {
        highQualitySkuMap.push(item);
      }
    }

    return {
      raw_html_text: rawHtmlText,
      raw_title: document.title || "",
      price_cny: extractBasePriceCny(rawHtmlText),
      images,
      original_link: window.location.href,
      visual_sku_map: highQualitySkuMap,
      weight_kg: 0.5,
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
    panel.innerHTML = `
      <h2 style="margin:0 0 10px;font-size:20px">M.Savdo — умный импорт</h2>
      <p id="msavdo-import-summary" style="margin:0 0 18px;color:#475569">Подготовка текста страницы, цены и изображений…</p>
      <p id="msavdo-import-status" style="min-height:20px;margin:0 0 16px;font-size:13px"></p>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button id="msavdo-import-close" type="button" style="padding:10px 14px;border:0;border-radius:9px;background:#e2e8f0;cursor:pointer">Закрыть</button>
        <button id="msavdo-import-submit" type="button" disabled style="padding:10px 16px;border:0;border-radius:9px;background:#111827;color:#fff;font-weight:700;cursor:pointer">Умный ИИ Импорт</button>
      </div>
    `;

    overlay.appendChild(panel);
    (document.body || document.documentElement).appendChild(overlay);

    const summary = panel.querySelector("#msavdo-import-summary");
    const status = panel.querySelector("#msavdo-import-status");
    const submitButton = panel.querySelector("#msavdo-import-submit");
    let payload = null;

    panel.querySelector("#msavdo-import-close").addEventListener("click", () => overlay.remove());
    submitButton.addEventListener("click", async () => {
      submitButton.disabled = true;
      submitButton.textContent = "Отправка данных…";
      status.textContent = "";

      try {
        const response = await sendRuntimeMessage({ action: "importProduct", payload });
        if (!response || !response.success) {
          throw new Error(response?.error || "Сервер не сохранил товар");
        }

        status.style.color = "#047857";
        status.textContent = `Товар отправлен на импорт: ${response.product?.title || "успешно"}`;
        submitButton.textContent = "Импорт завершён";
      } catch (error) {
        status.style.color = "#b91c1c";
        status.textContent = `Ошибка импорта: ${error.message}`;
        submitButton.disabled = false;
        submitButton.textContent = "Повторить импорт";
      }
    });

    gatherProductData()
      .then((productPayload) => {
        payload = productPayload;
        summary.textContent =
          `Цена: ¥${payload.price_cny} · Качественных фото: ${payload.images.length} · ` +
          `Цветов с фото: ${payload.visual_sku_map.length} · Текст страницы: ${payload.raw_html_text.length} символов`;
        submitButton.disabled = false;
      })
      .catch((error) => {
        summary.textContent = `Не удалось собрать данные страницы: ${error.message}`;
      });
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "openImporterModal" || request.action === "triggerImport") {
      showImporterModal();
      sendResponse({ success: true, message: "Импортер активирован" });
      return false;
    }

    if (request.action === "gatherProductData") {
      gatherProductData()
        .then((payload) => sendResponse({ success: true, payload }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    return false;
  });
})();
