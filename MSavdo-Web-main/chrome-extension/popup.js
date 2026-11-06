// popup.js — Управление расширением M.Savdo Co-Pilot v5.2.2

document.addEventListener("DOMContentLoaded", async () => {
  const tabSiteType = document.getElementById("tab-site-type");
  const tabTitle = document.getElementById("tab-title");
  const btnOpenPanel = document.getElementById("btn-open-panel");
  const btnQuickImport = document.getElementById("btn-quick-import");
  const btnOpenSite = document.getElementById("btn-open-site");
  const statusBox = document.getElementById("status-box");
  const toggleSettings = document.getElementById("toggle-settings");
  const settingsPanel = document.getElementById("settings-panel");
  const settingsArrow = document.getElementById("settings-arrow");
  const urlInput = document.getElementById("server-url");
  const btnPing = document.getElementById("btn-ping");
  const presetFlask = document.getElementById("preset-flask");
  const presetNode = document.getElementById("preset-node");
  const presetCloud = document.getElementById("preset-cloud");

  const CLOUD_URL = "https://api.msavdo.shop";

  // 1. Получаем активную вкладку
  let currentTab = null;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs[0];
  } catch (e) {
    console.error("Ошибка получения активной вкладки:", e);
  }

  if (currentTab && currentTab.url) {
    const url = currentTab.url.toLowerCase();
    tabTitle.innerText = currentTab.title || currentTab.url;
    tabTitle.title = currentTab.title || currentTab.url;

    if (url.includes("1688.com")) {
      tabSiteType.className = "status-pill pill-green";
      tabSiteType.innerText = "✓ 1688.com Товар";
    } else if (url.includes("yangkeduo.com") || url.includes("pinduoduo.com")) {
      tabSiteType.className = "status-pill pill-green";
      tabSiteType.innerText = "✓ Pinduoduo Товар";
    } else if (url.includes("taobao.com") || url.includes("tmall.com")) {
      tabSiteType.className = "status-pill pill-green";
      tabSiteType.innerText = "✓ Taobao / Tmall";
    } else {
      tabSiteType.className = "status-pill pill-amber";
      tabSiteType.innerText = "Веб-страница";
    }
  } else {
    tabTitle.innerText = "Вкладка не определена";
  }

  // 2. Загружаем серверный URL
  chrome.storage.local.get(["serverUrl"], (result) => {
    if (result.serverUrl) {
      urlInput.value = result.serverUrl;
    }
  });

  urlInput.addEventListener("change", () => {
    chrome.storage.local.set({ serverUrl: urlInput.value.trim() });
  });

  // Пресеты серверов
  presetFlask.addEventListener("click", () => {
    urlInput.value = "http://127.0.0.1:5000";
    chrome.storage.local.set({ serverUrl: urlInput.value });
    pingServer();
  });
  presetNode.addEventListener("click", () => {
    urlInput.value = "http://127.0.0.1:3000";
    chrome.storage.local.set({ serverUrl: urlInput.value });
    pingServer();
  });
  presetCloud.addEventListener("click", () => {
    urlInput.value = CLOUD_URL;
    chrome.storage.local.set({ serverUrl: urlInput.value });
    pingServer();
  });

  // Раскрытие настроек
  toggleSettings.addEventListener("click", () => {
    const isShown = settingsPanel.style.display === "block";
    settingsPanel.style.display = isShown ? "none" : "block";
    settingsArrow.innerText = isShown ? "▼" : "▲";
  });

  // Кнопка перехода на витрину
  btnOpenSite.addEventListener("click", () => {
    chrome.storage.local.get(["serverUrl"], (res) => {
      const target = res.serverUrl || "http://127.0.0.1:3000";
      chrome.tabs.create({ url: target });
    });
  });

  // Функция для безопасной отправки сообщения на вкладку с автоинъекцией скрипта при необходимости
  async function sendMessageToTabWithInjection(message) {
    if (!currentTab || !currentTab.id) {
      throw new Error("Не удалось определить активную вкладку Chrome");
    }

    try {
      // Сначала пробуем отправить сообщение напрямую
      const response = await chrome.tabs.sendMessage(currentTab.id, message);
      return response;
    } catch (err) {
      console.warn("content.js не отвечает, принудительно внедряем скрипт...", err);
      // Если вкладка была открыта до установки расширения, внедряем content.js вручную
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ["content.js"]
      });

      // Небольшая задержка для инициализации
      await new Promise(r => setTimeout(r, 200));
      return await chrome.tabs.sendMessage(currentTab.id, message);
    }
  }

  // 3. ГЛАВНАЯ КНОПКА: ОТКРЫТЬ CO-PILOT НА СТРАНИЦЕ ТОВАРА
  btnOpenPanel.addEventListener("click", async () => {
    btnOpenPanel.disabled = true;
    btnOpenPanel.innerHTML = "<span>⏳ Открываем панель...</span>";
    hideStatus();

    try {
      const res = await sendMessageToTabWithInjection({ action: "openImporterModal" });
      if (res && res.success) {
        showStatus("✓ Панель M.Savdo Co-Pilot открыта на странице товара! Закройте это окно и перейдите на страницу 1688.", "success");
        setTimeout(() => window.close(), 1200);
      } else {
        showStatus(res?.message || "Панель вызвана на странице", "success");
      }
    } catch (err) {
      showStatus("Не удалось открыть на этой вкладке. Обновите страницу 1688 (F5) и нажмите кнопку снова.<br><small>Ошибка: " + err.message + "</small>", "error");
    } finally {
      btnOpenPanel.disabled = false;
      btnOpenPanel.innerHTML = "<span>Открыть помощник на странице</span>";
    }
  });

  // Элементы ручного ввода и кода страницы
  const manualTitleInput = document.getElementById("manual-title");
  const manualDescInput = document.getElementById("manual-description");
  const pageCodeInput = document.getElementById("page-code-input");
  const btnPasteCode = document.getElementById("btn-paste-code");
  const btnExtract = document.getElementById("btn-extract");
  const summary = document.getElementById("preview-summary");
  const categoryInput = document.getElementById("category-name");
  const variantsList = document.getElementById("variants-list");
  const specificationsList = document.getElementById("specifications-list");
  const imagesInput = document.getElementById("images-input");
  const btnAddVariant = document.getElementById("btn-add-variant");
  const btnAddSpecification = document.getElementById("btn-add-specification");
  const chatInput = document.getElementById("chat-message");
  const keyInput = document.getElementById("gemini-key");
  const keyStatus = document.getElementById("key-status");
  const saveKeyButton = document.getElementById("btn-save-key");
  const removeKeyButton = document.getElementById("btn-remove-key");
  async function updateKey(action, key) {
    saveKeyButton.disabled = true;
    removeKeyButton.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({ action, ...(key ? { key } : {}) });
      if (!result?.success) throw new Error(result?.error || "Не удалось изменить ключ.");
      if (action === "saveGeminiKey" && keyInput.value.trim() === key) keyInput.value = "";
      keyStatus.textContent = result.hasKey
        ? "Используется личный ключ. Его работоспособность проверяется при обращении к ИИ."
        : "Личный ключ не задан: используется ключ сервера.";
    } catch (error) {
      keyStatus.textContent = `Ошибка: ${error.message}`;
    } finally {
      saveKeyButton.disabled = false;
      removeKeyButton.disabled = false;
    }
  }
  saveKeyButton.addEventListener("click", () => {
    const key = keyInput.value.trim();
    if (!key || /\s/.test(key)) {
      keyStatus.textContent = "Введите ключ Gemini без пробелов.";
      return;
    }
    return updateKey("saveGeminiKey", key);
  });
  removeKeyButton.addEventListener("click", () => updateKey("removeGeminiKey"));
  void updateKey("getGeminiKeyStatus");
  const aiModel = document.getElementById("ai-model");
  chrome.storage.local.get(["aiModel"], (result) => {
    if (["gemini-3.5-flash-lite", "gemini-3.8-flash"].includes(result.aiModel)) aiModel.value = result.aiModel;
  });
  aiModel.addEventListener("change", () => chrome.storage.local.set({ aiModel: aiModel.value }));
  const chatHistory = document.getElementById("chat-history");
  const proposalBox = document.getElementById("ai-proposal");
  const btnAi = document.getElementById("btn-ai");
  const btnApplyAi = document.getElementById("btn-apply-ai");
  let payload = null;
  let proposal = null;
  let history = [];
  let revision = 0;
  let proposalRevision = -1;
  let userTouched = false;
  const draftKey = `importDraft:${currentTab?.url || ""}`;

  function saveDraft() {
    userTouched = true;
    if (!payload || !currentTab?.url) return;
    revision += 1;
    chrome.storage.local.set({ [draftKey]: {
      url: currentTab.url, payload, title: manualTitleInput.value,
      description: manualDescInput.value, category: categoryInput.value,
      pageCode: pageCodeInput.value,
    } }, () => {
      if (chrome.runtime.lastError) showStatus(`Не удалось сохранить локальный черновик: ${chrome.runtime.lastError.message}`, "error");
    });
  }

  function renderVariants() {
    variantsList.replaceChildren();
    const variants = payload?.structured_data?.variants || [];
    if (!variants.length) variantsList.textContent = "Варианты не найдены; будет создан основной вариант.";
    variants.forEach((variant, index) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:4px;margin:3px 0;";
      for (const [field, label] of [["color", "Вариант"], ["size", "Размер"]]) {
        const input = document.createElement("input");
        input.value = variant[field] || "";
        input.placeholder = label;
        input.setAttribute("aria-label", `${label} ${index + 1}`);
        input.maxLength = 120;
        input.style.cssText = "width:50%;min-width:0;padding:4px;background:#09090b;border:1px solid #3f3f46;color:white;font-size:10px;";
        input.addEventListener("input", () => { variant[field] = input.value; saveDraft(); });
        row.appendChild(input);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Удалить вариант ${index + 1}`);
      remove.addEventListener("click", () => { variants.splice(index, 1); renderVariants(); saveDraft(); });
      row.appendChild(remove);
      variantsList.appendChild(row);
    });
    summary.textContent = `Вариантов: ${variants.length} · Фото: ${payload?.images?.length || 0} · Характеристик: ${payload?.structured_data?.specifications?.length || 0}`;
  }

  function renderDetails() {
    imagesInput.value = (payload?.images || []).join("\n");
    specificationsList.replaceChildren();
    const specifications = payload?.structured_data?.specifications || [];
    if (!specifications.length) specificationsList.textContent = "Характеристики не найдены.";
    specifications.forEach((specification, index) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:4px;margin:3px 0;";
      for (const [field, label, maxLength] of [["name", "Название", 120], ["value", "Значение", 500]]) {
        const input = document.createElement("input");
        input.value = specification[field] || "";
        input.setAttribute("aria-label", `${label} характеристики ${index + 1}`);
        input.maxLength = maxLength;
        input.style.cssText = "width:50%;min-width:0;padding:4px;background:#09090b;border:1px solid #3f3f46;color:white;font-size:10px;";
        input.addEventListener("input", () => { specification[field] = input.value; saveDraft(); });
        row.appendChild(input);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Удалить характеристику ${index + 1}`);
      remove.addEventListener("click", () => { specifications.splice(index, 1); renderDetails(); saveDraft(); });
      row.appendChild(remove);
      specificationsList.appendChild(row);
    });
  }

  btnAddVariant.addEventListener("click", () => {
    if (!payload?.structured_data) return showStatus("Сначала извлеките товар со страницы.", "error");
    payload.structured_data.variants.push({ color: "Новый вариант", size: "Стандарт", stock: 0, price_cny: 0, weight_kg: 0.5, image_url: "", sku_id: "" });
    renderVariants();
    saveDraft();
  });
  btnAddSpecification.addEventListener("click", () => {
    if (!payload?.structured_data) return showStatus("Сначала извлеките товар со страницы.", "error");
    if (payload.structured_data.specifications.length >= 100) return showStatus("Допускается не более 100 характеристик.", "error");
    payload.structured_data.specifications.push({ name: "", value: "" });
    renderDetails();
    saveDraft();
  });
  imagesInput.addEventListener("input", () => {
    if (!payload) return;
    payload.images = imagesInput.value.split("\n").map((url) => url.trim()).filter(Boolean);
    if (payload.structured_data) payload.structured_data.images = payload.images;
    saveDraft();
  });
  [manualTitleInput, manualDescInput, categoryInput, pageCodeInput].forEach((input) => input.addEventListener("input", saveDraft));
  chrome.storage.local.get([draftKey, "importDraft"], (result) => {
    const draft = result[draftKey] || result.importDraft;
    if (!payload && !userTouched && draft?.url === currentTab?.url && draft.payload) {
      payload = draft.payload;
      manualTitleInput.value = draft.title || "";
      manualDescInput.value = draft.description || "";
      categoryInput.value = draft.category || "";
      pageCodeInput.value = draft.pageCode || "";
      renderVariants();
      renderDetails();
      showStatus("Восстановлен локальный черновик этого товара.", "success");
    }
  });

  btnExtract.addEventListener("click", async () => {
    if (payload && !confirm("Повторное извлечение заменит текущий черновик. Продолжить?")) return;
    btnExtract.disabled = true;
    try {
      const result = await sendMessageToTabWithInjection({ action: "gatherProductData" });
      if (!result?.success || !result.payload) throw new Error(result?.error || "Данные страницы не получены");
      payload = result.payload;
      manualTitleInput.value = payload.structured_data?.title || payload.raw_title || currentTab?.title || "";
      manualDescInput.value = payload.description || "";
      categoryInput.value = "";
      proposal = null;
      btnApplyAi.hidden = true;
      proposalBox.textContent = "";
      history = [];
      chatHistory.textContent = "";
      renderVariants();
      renderDetails();
      saveDraft();
      showStatus("Данные извлечены. Проверьте название, описание и варианты; при необходимости попросите ИИ улучшить их.", "success");
    } catch (error) {
      showStatus(`Не удалось извлечь товар: ${error.message}`, "error");
    } finally {
      btnExtract.disabled = false;
    }
  });

  btnAi.addEventListener("click", async () => {
    if (!payload) return showStatus("Сначала извлеките товар со страницы.", "error");
    const instruction = chatInput.value.trim();
    if (!instruction) return showStatus("Напишите запрос ИИ-помощнику.", "error");
    btnAi.disabled = true;
    btnApplyAi.hidden = true;
    proposal = null;
    proposalBox.textContent = "";
    const requestRevision = revision;
    const requestModel = aiModel.value;
    try {
      const labels = [...new Set((payload.structured_data?.variants || [])
        .flatMap((variant) => [variant.color, variant.size])
        .filter((label) => typeof label === "string" && label.trim()))];
      const batches = [];
      for (let index = 0; index < labels.length; index += 100) batches.push(labels.slice(index, index + 100));
      if (!batches.length) batches.push([]);
      const translations = [];
      let firstResponse;
      const sourceText = `Характеристики: ${JSON.stringify(payload.structured_data?.specifications || [])}\n${pageCodeInput.value.trim() || payload.raw_text || ""}`.slice(0, 30000);
      for (let index = 0; index < batches.length; index += 1) {
        if (index && index % 14 === 0) {
          showStatus("Ожидание лимита запросов Gemini; не закрывайте окно расширения.", "success");
          await new Promise((resolve) => setTimeout(resolve, 60000));
        }
        showStatus(`Gemini: обработка группы ${index + 1} из ${batches.length}. Не закрывайте окно.`, "success");
        const response = await chrome.runtime.sendMessage({
          action: "importAssistant",
          payload: {
            title: manualTitleInput.value.slice(0, 500),
            description: manualDescInput.value.slice(0, 20000),
            source_text: sourceText,
            instruction: instruction.slice(0, 2000),
            history: history.slice(-6).map((entry) => entry.slice(0, 2000)),
            variant_labels: batches[index],
            model: requestModel,
          },
        });
        if (!response?.success) throw new Error(response?.error || "ИИ не ответил");
        if (!firstResponse) firstResponse = response.data;
        translations.push(...response.data.proposal.variant_labels);
      }
      proposal = { ...firstResponse.proposal, labels, translations };
      proposalRevision = requestRevision;
      history.push(`Редактор: ${instruction}`, `ИИ: ${firstResponse.reply}`);
      history = history.slice(-6);
      chatHistory.textContent = history.join("\n\n");
      const translatedLabels = labels.map((label, index) => `${label} → ${translations[index]}`).join("\n");
      proposalBox.textContent = `Предложение ${firstResponse.model || "Gemini"}:\n${proposal.title}\n${proposal.description}\nКатегория: ${proposal.category_name}${translatedLabels ? `\nВарианты:\n${translatedLabels}` : ""}`;
      btnApplyAi.hidden = false;
      chatInput.value = "";
      showStatus("Gemini ответил. Проверьте предложение перед применением.", "success");
    } catch (error) {
      showStatus(`Ошибка ИИ: ${error.message}`, "error");
    } finally {
      btnAi.disabled = false;
    }
  });

  btnApplyAi.addEventListener("click", () => {
    if (!proposal) return;
    if (revision !== proposalRevision) {
      showStatus("Данные товара изменились после запроса. Повторите запрос ИИ, чтобы не потерять правки.", "error");
      return;
    }
    manualTitleInput.value = proposal.title;
    manualDescInput.value = proposal.description;
    categoryInput.value = proposal.category_name;
    const translatedLabels = new Map(proposal.labels.map((label, index) => [label, proposal.translations[index]]));
    for (const variant of payload.structured_data?.variants || []) {
      if (translatedLabels.has(variant.color)) variant.color = translatedLabels.get(variant.color);
      if (translatedLabels.has(variant.size)) variant.size = translatedLabels.get(variant.size);
    }
    renderVariants();
    proposal = null;
    btnApplyAi.hidden = true;
    saveDraft();
    showStatus("Предложение применено к предпросмотру. Проверьте его перед сохранением.", "success");
  });

  if (btnPasteCode && pageCodeInput) {
    btnPasteCode.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          pageCodeInput.value = text;
          saveDraft();
          showStatus("✓ Код страницы успешно вставлен из буфера обмена!", "success");
        }
      } catch (err) {
        showStatus("Разрешите доступ к буферу обмена или вставьте код вручную (Ctrl+V)", "error");
      }
    });
  }

  // 4. ИМПОРТ ПРОВЕРЕННОГО ЧЕРНОВИКА
  btnQuickImport.addEventListener("click", async () => {
    if (!payload) return showStatus("Сначала извлеките товар со страницы.", "error");
    if (!manualTitleInput.value.trim()) return showStatus("Укажите название товара перед импортом.", "error");
    if ((payload.structured_data?.variants || []).some((variant) => !variant.color.trim() || !variant.size.trim())) {
      return showStatus("Укажите название и размер каждого варианта.", "error");
    }
    if ((payload.structured_data?.specifications || []).some((item) => !item.name.trim() || !item.value.trim())) {
      return showStatus("Заполните или удалите незавершённые характеристики.", "error");
    }
    if (payload.images.length > 32 || payload.images.some((value) => {
      try { return !["http:", "https:"].includes(new URL(value).protocol); }
      catch { return true; }
    })) return showStatus("Проверьте фотографии: разрешено до 32 корректных ссылок HTTP(S).", "error");
    btnQuickImport.disabled = true;
    btnQuickImport.textContent = "Сохранение...";
    hideStatus();

    const manualTitle = (manualTitleInput?.value || "").trim();
    const manualDesc = (manualDescInput?.value || "").trim();
    const pastedCode = (pageCodeInput?.value || "").trim();

    try {
      const importPayload = {
        ...payload,
        ...(pastedCode ? { raw_html_text: pastedCode } : {}),
        manual_title: manualTitle,
        manual_description: manualDesc,
        category_name: categoryInput.value.trim(),
        use_gemini: false,
        preserve_variant_names: true,
      };

      // Отправляем через background worker
      chrome.runtime.sendMessage({ action: "importProduct", payload: importPayload }, (res) => {
        btnQuickImport.disabled = false;
        btnQuickImport.textContent = "Сохранить черновик";

        if (res && res.success) {
          showStatus(`✓ <strong>Товар успешно импортирован!</strong><br>• ${res.product?.title || manualTitle || 'Товар добавлен'}<br>• Категория: ${res.product?.category_name || 'Каталог'}<br>• Вариантов: ${res.product?.variants_count || 1} шт.`, "success");
        } else {
          showStatus(`✕ <strong>Ошибка сохранения:</strong><br>${res?.error || chrome.runtime.lastError?.message || 'Сервер не сохранил товар'}`, "error");
        }
      });
    } catch (err) {
      btnQuickImport.disabled = false;
      btnQuickImport.textContent = "Сохранить черновик";
      showStatus(`✕ <strong>Ошибка импорта:</strong> ${err.message}<br><small>Вы можете вставить исходный код страницы (HTML / window.context) в поле выше.</small>`, "error");
    }
  });

  // 5. ПРОВЕРКА СВЯЗИ
  btnPing.addEventListener("click", pingServer);

  function pingServer() {
    const target = urlInput.value.trim();
    chrome.storage.local.set({ serverUrl: target });

    btnPing.disabled = true;
    btnPing.innerHTML = "<span>Проверка...</span>";
    hideStatus();

    chrome.runtime.sendMessage({ action: "ping", url: target }, (response) => {
      btnPing.disabled = false;
      btnPing.innerHTML = "<span>⚡ Проверить связь</span>";

      if (response && response.success) {
        showStatus(`Связь с сервером подтверждена: ${target}. Ключ Gemini: ${response.data?.gemini_enabled ? "настроен (работоспособность не проверена)" : "не настроен"}.`, "success");
      } else {
        showStatus(`✕ <strong>Сервер не отвечает (${target}):</strong><br>${response?.error || 'Таймаут или ошибка сети'}.<br><small>Убедитесь, что запущен <code>python3 app.py</code> (порт 5000) или Node сервер (порт 3000).</small>`, "error");
      }
    });
  }

  function showStatus(html, type) {
    statusBox.style.display = "block";
    statusBox.className = "status-msg " + (type === "success" ? "status-success" : "status-error");
    statusBox.textContent = html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "");
  }

  function hideStatus() {
    statusBox.style.display = "none";
  }
});
