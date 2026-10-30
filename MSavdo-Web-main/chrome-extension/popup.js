// popup.js — Управление расширением M.Savdo Co-Pilot v5.0

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

  const CLOUD_URL = "https://ais-dev-ahmyq45nmycvpjtbn4woji-541461425934.asia-northeast1.run.app";

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
      btnOpenPanel.innerHTML = "<span>🚀 Открыть Co-Pilot на странице</span>";
    }
  });

  // Элементы ручного ввода и кода страницы
  const manualTitleInput = document.getElementById("manual-title");
  const manualDescInput = document.getElementById("manual-description");
  const pageCodeInput = document.getElementById("page-code-input");
  const btnPasteCode = document.getElementById("btn-paste-code");

  if (btnPasteCode && pageCodeInput) {
    btnPasteCode.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          pageCodeInput.value = text;
          showStatus("✓ Код страницы успешно вставлен из буфера обмена!", "success");
        }
      } catch (err) {
        showStatus("Разрешите доступ к буферу обмена или вставьте код вручную (Ctrl+V)", "error");
      }
    });
  }

  // 4. ИМПОРТ ТОВАРА ЧЕРЕЗ ИИ
  btnQuickImport.addEventListener("click", async () => {
    btnQuickImport.disabled = true;
    btnQuickImport.innerHTML = "<span>⏳ Анализ ИИ и сохранение...</span>";
    hideStatus();

    const manualTitle = (manualTitleInput?.value || "").trim();
    const manualDesc = (manualDescInput?.value || "").trim();
    const pastedCode = (pageCodeInput?.value || "").trim();

    try {
      let payload = null;

      if (pastedCode && pastedCode.length > 20) {
        // Если пользователь вставил код страницы вручную
        payload = {
          raw_html_text: pastedCode,
          html_code: pastedCode,
          manual_title: manualTitle,
          manual_description: manualDesc,
          original_link: currentTab?.url || "",
          price_cny: 50,
          weight_kg: 0.5,
          use_gemini: true
        };
        showStatus("✓ Анализируем предоставленный исходный код страницы...", "success");
      } else {
        // Запрашиваем данные у страницы через content script
        const dataRes = await sendMessageToTabWithInjection({ action: "gatherProductData" });
        if (!dataRes || !dataRes.success || !dataRes.payload) {
          throw new Error(dataRes?.error || "Страница товара не передала данные. Попробуйте вставить код страницы вручную.");
        }
        payload = {
          ...dataRes.payload,
          manual_title: manualTitle,
          manual_description: manualDesc
        };
        showStatus("✓ Товар распознан со страницы! Отправка на сервер M.Savdo...", "success");
      }

      // Отправляем через background worker
      chrome.runtime.sendMessage({ action: "importProduct", payload }, (res) => {
        btnQuickImport.disabled = false;
        btnQuickImport.innerHTML = "<span>⚡ Импортировать товар через ИИ</span>";

        if (res && res.success) {
          showStatus(`✓ <strong>Товар успешно импортирован!</strong><br>• ${res.product?.title || manualTitle || 'Товар добавлен'}<br>• Категория: ${res.product?.category_name || 'Каталог'}<br>• Вариантов: ${res.product?.variants_count || 1} шт.`, "success");
        } else {
          showStatus(`✕ <strong>Ошибка сохранения:</strong><br>${res?.error || 'Сервер не сохранил товар'}`, "error");
        }
      });
    } catch (err) {
      btnQuickImport.disabled = false;
      btnQuickImport.innerHTML = "<span>⚡ Импортировать товар через ИИ</span>";
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
        showStatus(`✓ <strong>Связь с сервером подтверждена!</strong><br>Сервер по адресу <code>${target}</code> готов принимать товары.`, "success");
      } else {
        showStatus(`✕ <strong>Сервер не отвечает (${target}):</strong><br>${response?.error || 'Таймаут или ошибка сети'}.<br><small>Убедитесь, что запущен <code>python3 app.py</code> (порт 5000) или Node сервер (порт 3000).</small>`, "error");
      }
    });
  }

  function showStatus(html, type) {
    statusBox.style.display = "block";
    statusBox.className = "status-msg " + (type === "success" ? "status-success" : "status-error");
    statusBox.innerHTML = html;
  }

  function hideStatus() {
    statusBox.style.display = "none";
  }
});
