const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("extracts product title and SKU images when page heading is the seller's factory", () => {
  const title = "Portable solar camping light";
  const root = {
    result: { data: { Root: { fields: { dataJson: {
      skuModel: {
        skuProps: [{ prop: "Power", value: [
          { name: "Large with solar panel", imageUrl: "https://example.com/large.jpg" },
          { name: "Small", imageUrl: "https://example.com/small.jpg" },
        ] }],
        skuInfoMap: {
          "Large with solar panel&gt;White light": { specAttrs: "Large with solar panel&gt;White light", skuId: 123 },
          "Small&gt;White light": { specAttrs: "Small&gt;White light", skuId: 456 },
        },
      },
    } } } }, global: { globalData: { model: {
      offerDetail: {
        subject: title,
        featureAttributes: [{ name: "Material", value: "Plastic" }, ...Array.from({ length: 120 }, (_, i) => ({ name: `Feature ${i}`, value: `Value ${i}` }))],
        galleryImages: Array.from({ length: 40 }, (_, i) => `https://example.com/product-${i}.jpg`),
      },
    } } } },
  };
  const script = { textContent: `window.context=(function(b,d){return d})(window.contextPath,${JSON.stringify(root)});` };
  const heading = { innerText: "深圳市宝安区西乡金太星照明电器厂" };
  let listener;
  const document = {
    title: `${title} - 阿里巴巴`,
    baseURI: "https://detail.1688.com/offer/123.html",
    body: {},
    querySelector(selector) { return selector === "h1" ? heading : null; },
    querySelectorAll(selector) { return selector === "script:not([src])" ? [script] : []; },
  };
  const window = {
    location: { href: document.baseURI },
    getComputedStyle: () => ({}),
  };
  const chrome = { runtime: { onMessage: { addListener(fn) { listener = fn; } } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "content.js"), "utf8"), {
    document, window, chrome, URL, Element: class {}, performance: { getEntriesByType: () => [] },
  });
  let response;
  listener({ action: "gatherProductData" }, {}, (value) => { response = value; });
  assert.equal(response.success, true);
  assert.equal(response.payload.structured_data.title, title);
  assert.equal(response.payload.structured_data.specifications.length, 121);
  assert.ok(response.payload.images.length >= 40);
  assert.equal(response.payload.structured_data.variants.length, 2);
  assert.equal(response.payload.structured_data.variants[0].color, "Large with solar panel");
  assert.equal(response.payload.structured_data.variants[0].image_url, "https://example.com/large.jpg");
  assert.equal(response.payload.structured_data.variants[1].image_url, "https://example.com/small.jpg");
  assert.equal(response.payload.structured_data.variants[1].sku_id, "456");
  assert.ok(response.payload.raw_text.startsWith(`НАЗВАНИЕ ТОВАРА: ${title}`));
  assert.equal(response.payload.raw_text.includes(heading.innerText), false);
});
