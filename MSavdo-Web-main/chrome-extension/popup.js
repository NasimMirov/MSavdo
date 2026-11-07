document.addEventListener("DOMContentLoaded", () => {
  const pageCode = document.getElementById("page-code");
  const button = document.getElementById("import");
  const status = document.getElementById("status");
  const pairing = document.getElementById("pairing");
  const pairButton = document.getElementById("pair");
  const keyInput = document.getElementById("import-key");
  const maxCodeLength = 2000000;
  let currentProductId = 0;

  function showStatus(message, type) {
    status.textContent = message;
    status.className = type;
  }

  async function readPage(tab) {
    try {
      return await chrome.tabs.sendMessage(tab.id, { action: "gatherProductData" });
    } catch (error) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      return await chrome.tabs.sendMessage(tab.id, { action: "gatherProductData" });
    }
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response?.success) {
          if (response?.needsPairing) pairing.hidden = false;
          return reject(new Error(response?.error || "Не удалось выполнить запрос."));
        }
        resolve(response);
      });
    });
  }

  async function checkStatus(product) {
    currentProductId = product.id;
    const id = product.id;
    try {
      const result = await sendMessage({ action: "getImportStatus", id });
      if (currentProductId !== id) return;
      showStatus(`Черновик: ${product.title}\nАртикул: ${product.base_sku} · ID: ${id}\n${result.message}`, result.status === "failed" || result.status === "partial" ? "error" : "success");
      if (result.status === "queued" || result.status === "processing") {
        setTimeout(() => void checkStatus(product), 3000);
      }
    } catch (error) {
      if (currentProductId === id) showStatus(`Черновик ID ${id} сохранён. Не удалось проверить ИИ: ${error.message}. Проверьте товар в админке.`, "error");
    }
  }

  pairButton.addEventListener("click", async () => {
    pairButton.disabled = true;
    try {
      await sendMessage({ action: "pairImportKey", key: keyInput.value });
      keyInput.value = "";
      pairing.hidden = true;
      showStatus("Расширение привязано к админке.", "success");
    } catch (error) {
      showStatus(error.message, "error");
    } finally {
      pairButton.disabled = false;
    }
  });

  void sendMessage({ action: "getImportSetup" }).then((result) => {
    pairing.hidden = result.paired;
    if (!currentProductId && result.paired && result.lastImport) void checkStatus(result.lastImport);
  }).catch((error) => {
    pairing.hidden = false;
    showStatus(`Не удалось проверить привязку: ${error.message}`, "error");
  });

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Импортируем...";
    showStatus("", "");
    try {
      const code = pageCode.value.trim();
      if (code.length > maxCodeLength) throw new Error("Код страницы слишком большой: максимум 2 000 000 символов.");
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url) throw new Error("Не удалось определить текущую вкладку.");

      let payload;
      if (code) {
        payload = { raw_html_text: code, original_link: tab.url };
      } else {
        const result = await readPage(tab);
        if (!result?.success || !result.payload) throw new Error(result?.error || "Не удалось прочитать страницу товара.");
        payload = result.payload;
      }

      const result = await sendMessage({ action: "importProduct", payload: {
        ...payload, original_link: tab.url, preserve_variant_names: true,
      } });
      currentProductId = result.product.id;
      showStatus(`Товар сохранён в черновики msavdo.shop: ${result.product.title}\nАртикул: ${result.product.base_sku} · ID: ${result.product.id}\n${result.automatic_ai?.message || ""}\n${result.storageWarning || ""}`, result.automatic_ai?.status === "unavailable" ? "error" : "success");
      if (result.automatic_ai && result.automatic_ai.status !== "unavailable") void checkStatus(result.product);
    } catch (error) {
      showStatus(`Ошибка импорта: ${error.message}`, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Импортировать товар";
    }
  });
});
