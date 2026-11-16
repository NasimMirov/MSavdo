import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const guideUrl = 'https://somon.tj/business-xml-guide/';
const response = await fetch(guideUrl, {
  headers: { 'user-agent': 'M.Savdo Somon XML guide sync' },
});
if (!response.ok) throw new Error(`Somon guide request failed: ${response.status}`);

const html = await response.text();
const output = fileURLToPath(new URL('../docs/somon/business-xml-guide.html', import.meta.url));
const stamp = new Date().toISOString();
await writeFile(output, `<!-- Source: ${guideUrl}; fetched: ${stamp} -->\n${html}`, 'utf8');
console.log(`Saved ${output} (${html.length} characters)`);
