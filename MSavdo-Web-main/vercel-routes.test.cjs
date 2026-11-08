const test = require("node:test");
const assert = require("node:assert/strict");
const pathToRegexp = require("path-to-regexp");
const { rewrites } = require("./vercel.json");

test("Vercel forwards product and sitemap routes without intercepting the storefront or API", () => {
  const expected = new Map([
    ["/product/38/%D1%82%D0%BE%D0%B2%D0%B0%D1%80", "https://api.msavdo.shop/product/:path*"],
    ["/product/38", "https://api.msavdo.shop/product/:path*"],
    ["/robots.txt", "https://api.msavdo.shop/robots.txt"],
    ["/sitemap.xml", "https://api.msavdo.shop/sitemap.xml"],
    ["/sitemap-products-1.xml", "https://api.msavdo.shop/sitemap-products-:page.xml"],
    ["/sitemap-products-42.xml", "https://api.msavdo.shop/sitemap-products-:page.xml"],
  ]);
  const matches = (pathname) => rewrites.filter(({ source }) => pathToRegexp(source).test(pathname));
  for (const [pathname, destination] of expected) {
    const rules = matches(pathname);
    assert.equal(rules.length, 1, pathname);
    assert.equal(rules[0].destination, destination);
  }
  for (const pathname of ["/", "/api/products", "/assets/index.js", "/sitemap-products-1.json"]) {
    assert.equal(matches(pathname).length, 0, pathname);
  }
});
