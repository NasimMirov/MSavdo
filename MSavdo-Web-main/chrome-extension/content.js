(function () {
  "use strict";

  if (window.__MSAVDO_CONTENT_SCRIPT_LOADED__) return;
  window.__MSAVDO_CONTENT_SCRIPT_LOADED__ = true;

  const MODAL_ID = "msavdo-smart-import-modal";
  const MAX_TEXT_LENGTH = 30000;
  const MAX_IMAGES = 12;
  const MAX_VIDEOS = 12;
  const EXCLUDED_IMAGE_TOKENS = [
    "logo", "avatar", "qrcode", "qr-code", "banner", "icon", "wangwang",
    "service", "seller", "sprite",
  ];

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isProductUiElement(element) {
    return Boolean(element.closest(
      "header, nav, footer, aside, [role='navigation'], [class*='logo' i], [class*='avatar' i], [class*='banner' i], [class*='qrcode' i], [class*='service' i], [class*='seller' i]"
    ));
  }

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
      const part = normalized.slice(0, Math.min(remainingLength, 2500));
      textParts.push(part);
      textLength += separatorLength + part.length;
    };

    appendText(document.querySelector("h1")?.innerText);
    appendText(document.querySelector('meta[property="og:title"]')?.content);
    appendText(document.title);

    const productDataSelectors = [
      '[class*="price" i]',
      '[id*="price" i]',
      '[class*="sku" i] [class*="item" i]',
      '[class*="sku" i] button',
      '[class*="sku" i] [role="radio"]',
      '[class*="spec" i] button',
      '[class*="size" i] button',
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
      let appendedForSelector = 0;
      for (const element of document.querySelectorAll(selector)) {
        if (!isVisible(element) || isProductUiElement(element)) continue;
        appendText(getElementText(element));
        appendedForSelector += 1;
        if (appendedForSelector >= 100 || textLength >= MAX_TEXT_LENGTH) break;
      }
      if (textLength >= MAX_TEXT_LENGTH) break;
    }

    for (const row of document.querySelectorAll("table tr, dl, [class*='attribute-item' i], [class*='attr-item' i]")) {
      if (!isVisible(row) || isProductUiElement(row)) continue;
      appendText(getElementText(row));
      if (textLength >= MAX_TEXT_LENGTH) break;
    }

    if (textLength < MAX_TEXT_LENGTH) {
      const mainContent = document.querySelector("main, article, [role='main'], [class*='product-detail' i], [class*='offer-detail' i]");
      if (mainContent && isVisible(mainContent)) appendText(getElementText(mainContent));
    }

    return textParts.join("\n\n");
  }

  function getBasePrice(text) {
    const prices = [];
    const pricePattern = /(?:(?:CN¥|CNY|RMB|[¥￥])\s*(\d{1,7}(?:[.,]\d{1,2})?)|(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:元|人民币|юан(?:ь|я|ей)?|yuan))/gi;
    let match;

    while ((match = pricePattern.exec(text)) !== null) {
      const price = Number(String(match[1] || match[2]).replace(",", "."));
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
      const lowerUrl = `${url.pathname}${url.search}`.toLowerCase();
      for (const token of EXCLUDED_IMAGE_TOKENS) {
        if (lowerUrl.includes(token)) return "";
      }
      if (/\.(?:svg|gif|ico)(?:[?#]|$)/i.test(url.href)) return "";
      return url.href;
    } catch {
      return "";
    }
  }

  function getImageUrl(image) {
    const attributes = ["data-zoom-image", "data-original", "data-large", "data-lazy-src", "data-src", "src"];
    for (const attribute of attributes.slice(0, -1)) {
      const url = normalizeImageUrl(image.getAttribute(attribute));
      if (url) return url;
    }
    const srcSet = image.getAttribute("srcset") || image.getAttribute("data-srcset") || "";
    const largestSrc = srcSet.split(",")
      .map((candidate) => candidate.trim().split(/\s+/)[0])
      .filter(Boolean)
      .pop();
    return normalizeImageUrl(image.currentSrc || largestSrc || image.getAttribute("src"));
  }

  function collectImages() {
    const candidates = new Map();
    const addCandidate = (rawUrl, element, mediaBonus = 0) => {
      const url = normalizeImageUrl(rawUrl);
      if (!url || isProductUiElement(element)) return;
      const rect = element?.getBoundingClientRect?.();
      const width = Math.max(
        element?.naturalWidth || 0,
        Number(element?.getAttribute?.("width")) || 0,
        rect?.width || 0,
      );
      const height = Math.max(
        element?.naturalHeight || 0,
        Number(element?.getAttribute?.("height")) || 0,
        rect?.height || 0,
      );
      if (width > 0 && width < 90 || height > 0 && height < 90) return;
      const galleryContext = Boolean(element?.closest(
        "[class*='gallery' i], [class*='image' i], [class*='photo' i], [class*='picture' i], [class*='sku' i], [class*='video' i]"
      ));
      const score = Math.min(width * height, 2500000) + (galleryContext ? 500000 : 0) + mediaBonus;
      candidates.set(url, Math.max(candidates.get(url) || 0, score));
    };

    for (const image of document.querySelectorAll("img")) {
      addCandidate(getImageUrl(image), image);
    }
    for (const video of document.querySelectorAll("video[poster]")) {
      addCandidate(video.getAttribute("poster"), video, 350000);
    }
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) addCandidate(ogImage.content, ogImage, -100000);

    return Array.from(candidates.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, MAX_IMAGES)
      .map(([url]) => url);
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

  function collectVideoUrls(contextRoot = null) {
    const videoUrls = new Set();
    const addUrl = (value) => {
      const url = normalizeVideoUrl(value);
      if (url) videoUrls.add(url);
    };

    for (const media of document.querySelectorAll("video, video source, [data-video-url], [data-play-url], [data-video-src]")) {
      for (const attribute of ["src", "data-src", "data-video-url", "data-play-url", "data-video-src", "data-url"]) {
        addUrl(media.currentSrc || media.getAttribute(attribute));
      }
      if (videoUrls.size >= MAX_VIDEOS) return Array.from(videoUrls);
    }
    for (const player of document.querySelectorAll("iframe[src*='video' i], iframe[src*='player' i]")) {
      addUrl(player.src);
      if (videoUrls.size >= MAX_VIDEOS) return Array.from(videoUrls);
    }

    for (const meta of document.querySelectorAll('meta[property*="video" i], meta[name*="video" i], link[href*=".mp4" i], link[href*=".m3u8" i]')) {
      addUrl(meta.content || meta.href);
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

    if (contextRoot) visitVideoFields(contextRoot);
    for (const script of document.querySelectorAll("script:not([src])")) {
      if (videoUrls.size >= MAX_VIDEOS) break;
      const scriptText = script.textContent || "";
      if (scriptText.length > 1000000 || !/video|playurl|mediaurl/i.test(scriptText)) continue;

      const candidates = [];
      const assignment = /(?:window\.)?(?:context|__INIT_DATA__|runParams|__INITIAL_DATA__)\s*=/gi;
      let assignmentMatch;
      while ((assignmentMatch = assignment.exec(scriptText)) !== null) {
        const afterAssignment = assignment.lastIndex;
        const wrapper = /\}\)\s*\(\s*[^,]+,\s*/g;
        wrapper.lastIndex = afterAssignment;
        const wrapped = wrapper.exec(scriptText);
        const startSearch = wrapped ? wrapper.lastIndex : afterAssignment;
        const objectStart = scriptText.indexOf("{", startSearch);
        if (objectStart < 0) continue;
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let index = objectStart; index < scriptText.length; index += 1) {
          const character = scriptText[index];
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
              candidates.push(JSON.parse(scriptText.slice(objectStart, index + 1)));
            } catch {
              break;
            }
            break;
          }
        }
      }
      if (scriptText.trim().startsWith("{")) {
        try {
          candidates.push(JSON.parse(scriptText.trim()));
        } catch {
          // Other inline scripts may contain JavaScript rather than JSON.
        }
      }
      candidates.forEach((candidate) => visitVideoFields(candidate));

      const videoFieldMatches = scriptText.matchAll(/(?:videoUrl|playUrl|video_url|videoAddress|mediaUrl)\s*["']?\s*[:=]\s*["']([^"'\s<>]+)/gi);
      for (const match of videoFieldMatches) {
        addUrl(match[1].replace(/\\u002F/gi, "/").replace(/\\\//g, "/"));
        if (videoUrls.size >= MAX_VIDEOS) break;
      }
    }

    for (const resource of performance.getEntriesByType("resource")) {
      const resourceName = resource.name || "";
      if (/\.(?:mp4|m3u8|m4v|mov|flv|mpd)(?:[?#]|$)/i.test(resourceName)
        || /(?:cloud\.video\.taobao\.com|video\.alicdn\.com|video\.taobaocdn\.com)/i.test(resourceName)) {
        addUrl(resourceName);
      }
      if (videoUrls.size >= MAX_VIDEOS) break;
    }

    return Array.from(videoUrls).slice(0, MAX_VIDEOS);
  }

  function parseInlineProductContext() {
    const scripts = document.querySelectorAll("script:not([src])");
    for (const script of scripts) {
      const source = script.textContent || "";
      if (source.length > 1000000 || !/skuInfoMap|featureAttributes|offerDetail|productPackInfo|subject/i.test(source)) continue;
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

  function chooseBestTitle(candidates) {
    const cleanCandidates = candidates
      .map((candidate) => cleanStructuredText(candidate).replace(/\s+/g, " ").trim())
      .filter((candidate) => candidate && candidate.length <= 250)
      .filter((candidate) => !/^(?:1688|taobao|alibaba|pinduoduo)(?:\.com)?$/i.test(candidate));
    const translatedTitle = cleanCandidates.find((candidate) => /[а-яё]{3}/i.test(candidate));
    return translatedTitle || cleanCandidates.find((candidate) => /[\u3400-\u9fff]{2}/.test(candidate)) || cleanCandidates[0] || "";
  }

  function collectVisibleOptions(headingPattern, labelPattern) {
    const headings = Array.from(document.querySelectorAll("body *"))
      .filter((element) => element.children.length <= 2)
      .filter((element) => headingPattern.test((element.innerText || element.textContent || "").trim()))
      .filter((element) => isVisible(element));
    const options = new Set();
    const optionSelector = "button, li, [role='radio'], [role='option'], [aria-label], [class*='item' i], [class*='value' i], span";

    for (const heading of headings.slice(0, 20)) {
      let ancestor = heading.parentElement;
      for (let depth = 0; ancestor && depth < 4; depth += 1, ancestor = ancestor.parentElement) {
        const found = new Set();
        for (const option of ancestor.querySelectorAll(optionSelector)) {
          if (!isVisible(option) || isProductUiElement(option)) continue;
          const label = (option.getAttribute("aria-label") || option.innerText || option.textContent || "")
            .replace(/\s+/g, " ").trim();
          if (label.length <= 40 && labelPattern.test(label)) found.add(label);
        }
        if (found.size >= 2) {
          found.forEach((label) => options.add(label));
          break;
        }
      }
    }
    return Array.from(options).slice(0, 100);
  }

  function isLikelySizeLabel(value) {
    const normalized = value.replace(/\s+/g, "").toUpperCase();
    if (/^(?:XS|S|M|L|XL|XXL|XXXL|[2-8]XL|均码|均碼|OS|ONESIZE)$/.test(normalized)) return true;
    const numberMatch = normalized.match(/^(\d{1,3}(?:\.\d+)?)(码|碼|CM|厘米|MM|毫米|KG|公斤|G|克|ML|毫升)?$/i);
    if (!numberMatch) return false;
    const number = Number(numberMatch[1]);
    return Boolean(numberMatch[2]) || (number >= 20 && number <= 120);
  }

  function variantsHaveSameColor(left, right) {
    const normalize = (value) => String(value || "").toLocaleLowerCase().replace(/\s+/g, "");
    const first = normalize(left);
    const second = normalize(right);
    if (first === second || first.includes(second) || second.includes(first)) return true;
    const colorGroups = [
      ["黑", "black", "черн"],
      ["白", "white", "бел"],
      ["灰", "grey", "gray", "сер"],
      ["红", "red", "красн"],
      ["蓝", "blue", "син"],
      ["粉", "pink", "розов"],
      ["黄", "yellow", "желт"],
      ["绿", "green", "зелен"],
      ["咖", "棕", "brown", "корич", "кофейн"],
      ["米", "beige", "khaki", "беж", "хаки"],
    ];
    return colorGroups.some((group) =>
      group.some((token) => first.includes(token))
      && group.some((token) => second.includes(token))
    );
  }

  function extractDomSpecifications() {
    const specifications = [];
    const seen = new Set();
    const add = (name, value) => {
      const cleanName = cleanStructuredText(name).replace(/[：:]$/, "").trim();
      const cleanValue = cleanStructuredText(value).trim();
      const normalizedName = cleanName.toLowerCase();
      if (!cleanName || !cleanValue || cleanName.length > 100 || cleanValue.length > 500 || seen.has(normalizedName)) return;
      seen.add(normalizedName);
      specifications.push({ name: cleanName, value: cleanValue });
    };

    for (const row of document.querySelectorAll("table tr")) {
      if (!isVisible(row) || isProductUiElement(row)) continue;
      const cells = Array.from(row.querySelectorAll(":scope > th, :scope > td"))
        .map((cell) => (cell.innerText || cell.textContent || "").trim())
        .filter(Boolean);
      if (cells.length >= 2) add(cells[0], cells.slice(1).join(" / "));
    }

    for (const list of document.querySelectorAll("dl")) {
      if (!isVisible(list) || isProductUiElement(list)) continue;
      const children = Array.from(list.children);
      for (let index = 0; index < children.length - 1; index += 1) {
        if (children[index].tagName === "DT" && children[index + 1].tagName === "DD") {
          add(children[index].innerText, children[index + 1].innerText);
        }
      }
    }

    for (const item of document.querySelectorAll(
      "[class*='attribute-item' i], [class*='attr-item' i], [class*='property-item' i], [class*='param-item' i]"
    )) {
      if (!isVisible(item) || isProductUiElement(item)) continue;
      const parts = Array.from(item.querySelectorAll("span, label, dt, dd"))
        .map((part) => (part.innerText || part.textContent || "").trim())
        .filter(Boolean);
      if (parts.length >= 2) add(parts[0], parts.slice(1).join(" / "));
    }
    return specifications.slice(0, 100);
  }

  function extractDomProductData() {
    const title = chooseBestTitle([
      document.querySelector("h1")?.innerText,
      document.querySelector('meta[property="og:title"]')?.content,
      document.title,
    ]);
    const sizes = collectVisibleOptions(
      /^(?:尺码|尺碼|尺寸|size|размер|размеры)$/i,
      (value) => isLikelySizeLabel(value),
    );
    const colors = collectVisibleOptions(
      /^(?:颜色|顏色|颜色分类|colour|color|цвет|цвета)$/i,
      (value) => value.length > 0 && value.length <= 40
        && !/^\d+(?:\.\d+)?$/.test(value)
        && !/[¥￥]/.test(value)
        && /黑|白|灰|红|藍|蓝|粉|黄|绿|咖|棕|米|卡其|橙|紫|金|银|black|white|grey|gray|blue|red|pink|yellow|green|brown|beige|khaki|черн|бел|сер|красн|син|розов|желт|зелен|корич|беж|хаки/i.test(value),
    );
    const priceTexts = Array.from(document.querySelectorAll(
      '[class*="price" i], [id*="price" i], [data-price]'
    ))
      .filter((element) => isVisible(element) && !isProductUiElement(element))
      .slice(0, 40)
      .map((element) => getElementText(element))
      .filter(Boolean);

    return {
      title,
      title_candidates: [
        document.querySelector("h1")?.innerText || "",
        document.querySelector('meta[property="og:title"]')?.content || "",
        document.title || "",
      ].filter(Boolean).slice(0, 5),
      specifications: extractDomSpecifications(),
      sizes,
      colors,
      price_text: priceTexts.join("\n").slice(0, 5000),
    };
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

    const videoUrls = new Set(collectVideoUrls(root));
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
      title_candidates: [title],
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
      if (!isVisible(control) || isProductUiElement(control)) continue;
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
    const pageText = getPageText();
    const domData = extractDomProductData();
    const extracted = extractStructuredProductData();
    const structuredData = extracted || {
      title: "",
      title_candidates: [],
      specifications: [],
      variants: [],
      images: [],
      video_urls: [],
      weight_kg: 0,
    };
    const visualSkuMap = collectVisualSkuMap().slice(0, MAX_IMAGES);
    const productColors = Array.from(new Set([
      ...domData.colors,
      ...visualSkuMap.map((item) => item.raw_color),
    ])).slice(0, 20);
    const basePrice = getBasePrice(`${domData.price_text}\n${pageText}`);
    const structuredPrice = structuredData.variants
      .map((variant) => variant.price_cny)
      .filter((price) => Number.isFinite(price) && price > 0)
      .sort((left, right) => left - right)[0];
    const priceCny = structuredPrice || basePrice || null;

    if (domData.sizes.length > 0) {
      const colors = productColors.length > 0 ? productColors : ["Стандарт"];
      const domVariants = colors.flatMap((color) => domData.sizes.map((size) => {
        const existing = structuredData.variants.find((variant) =>
          variant.size.toLocaleLowerCase().includes(size.toLocaleLowerCase())
          && (color === "Стандарт" || variantsHaveSameColor(variant.color, color))
        ) || structuredData.variants.find((variant) =>
          variant.size.toLocaleLowerCase().includes(size.toLocaleLowerCase())
        );
        const visual = visualSkuMap.find((item) =>
          item.raw_color === color || item.raw_color.toLocaleLowerCase().includes(color.toLocaleLowerCase())
        );
        return {
          color,
          size,
          price_cny: existing?.price_cny || priceCny || 0,
          stock: existing?.stock ?? 25,
          weight_kg: existing?.weight_kg || structuredData.weight_kg || 0.5,
          image_url: existing?.image_url || visual?.image_url || "",
          sku_id: existing?.sku_id || "",
        };
      }));
      const exactStructuredVariants = structuredData.variants.filter((variant) =>
        variant.size && !/^(?:стандарт|standard)$/i.test(variant.size.trim())
      );
      const completeDomSizes = domVariants.filter((variant) =>
        !exactStructuredVariants.some((existing) =>
          existing.size.toLocaleLowerCase().includes(variant.size.toLocaleLowerCase())
          && (variant.color === "Стандарт" || variantsHaveSameColor(existing.color, variant.color))
        )
      );
      structuredData.variants = [...exactStructuredVariants, ...completeDomSizes].slice(0, 500);
    }

    const mergedSpecs = new Map();
    for (const specification of [...structuredData.specifications, ...domData.specifications]) {
      const key = specification.name.toLocaleLowerCase();
      if (!mergedSpecs.has(key)) mergedSpecs.set(key, specification);
    }
    structuredData.specifications = Array.from(mergedSpecs.values()).slice(0, 100);
    structuredData.title = chooseBestTitle([
      domData.title,
      ...domData.title_candidates,
      ...structuredData.title_candidates,
      structuredData.title,
    ]);
    structuredData.images = Array.from(new Set([
      ...structuredData.images,
      ...collectImages(),
    ])).slice(0, 32);
    structuredData.video_urls = Array.from(new Set([
      ...structuredData.video_urls,
      ...collectVideoUrls(),
    ])).slice(0, MAX_VIDEOS);
    const structuredDetails = [
      structuredData.title ? `НАЗВАНИЕ ТОВАРА: ${structuredData.title}` : "",
      ...structuredData.specifications.map((item) => `ХАРАКТЕРИСТИКА: ${item.name}: ${item.value}`),
      ...structuredData.variants.map((item) =>
        `ВАРИАНТ SKU: ${item.color} | ${item.size} | цена ¥${item.price_cny || priceCny || "не указана"} | остаток ${item.stock}`
      ),
      ...domData.title_candidates.map((candidate) => `НАЗВАНИЕ НА СТРАНИЦЕ: ${candidate}`),
    ].filter(Boolean).join("\n");
    const rawText = `${pageText}\n\n${structuredDetails}`.slice(0, MAX_TEXT_LENGTH);

    return {
      raw_text: rawText,
      raw_title: structuredData.title || document.title || "",
      price_cny: priceCny,
      images: structuredData.images.slice(0, MAX_IMAGES),
      video_urls: structuredData.video_urls,
      original_link: window.location.href,
      visual_sku_map: visualSkuMap,
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
    disclosure.textContent = "На сервер, указанный в настройках расширения, будут отправлены данные товарной части страницы: название, характеристики, варианты и цены, а также ссылки на найденные фото и видео.";
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
      const variantCount = payload.structured_data?.variants?.length || 0;
      const specificationCount = payload.structured_data?.specifications?.length || 0;
      summary.textContent = Number.isFinite(payload.price_cny)
        ? `Цена: ¥${payload.price_cny} · Вариантов: ${variantCount} · Характеристик: ${specificationCount} · Фото: ${payload.images.length} · Видео: ${payload.video_urls.length} · Текст: ${payload.raw_text.length} символов`
        : `Цена в юанях не найдена · Вариантов: ${variantCount} · Характеристик: ${specificationCount} · Фото: ${payload.images.length} · Видео: ${payload.video_urls.length} · Текст: ${payload.raw_text.length} символов`;
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
