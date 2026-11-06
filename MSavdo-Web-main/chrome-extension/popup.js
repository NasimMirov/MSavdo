document.addEventListener("DOMContentLoaded", () => {
  const pageCode = document.getElementById("page-code");
  const button = document.getElementById("import");
  const status = document.getElementById("status");
  const maxCodeLength = 2000000;

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

  function importProduct(payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: "importProduct", payload }, (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response?.success) return reject(new Error(response?.error || "Сервер не сохранил товар."));
        resolve(response);
      });
    });
  }

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

      const result = await importProduct({
        ...payload,
        original_link: tab.url,
        use_gemini: false,
        preserve_variant_names: true,
        preserve_source_title: true,
      });
      showStatus(`Товар импортирован в черновики: ${result.product?.title || "товар"}. Вариантов: ${result.product?.variants_count ?? 0}.`, "success");
    } catch (error) {
      showStatus(`Ошибка импорта: ${error.message}`, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Импортировать товар";
    }
  });
});
