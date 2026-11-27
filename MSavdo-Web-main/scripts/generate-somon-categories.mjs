import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../docs/somon/business-xml-guide.html', import.meta.url));
const output = fileURLToPath(new URL('../src/data/somonCategories.ts', import.meta.url));
const html = await readFile(source, 'utf8');
const rows = [...html.matchAll(/<a href="[^"]*rubric_id=(\d+)[^"]*">([^<]+)<\/a>\s*(\d+)\s*<br>/g)]
  .map((match) => ({ rubric_id: Number(match[1]), path: match[2].trim() }))
  .filter(({ path }) => !/^(?:Новостройки|Недвижимость|Услуги|Вакансии|Отдам даром)(?:\s*\/|$)/.test(path));
const unique = [...new Map(rows.map((row) => [row.rubric_id, row])).values()]
  .sort((a, b) => a.path.localeCompare(b.path, 'ru') || a.rubric_id - b.rubric_id);
const content = `// Generated from docs/somon/business-xml-guide.html. Run npm run generate:somon-categories after syncing the official snapshot.\nexport interface SomonCategory { rubric_id: number; path: string; }\nexport const SOMON_CATEGORIES: SomonCategory[] = ${JSON.stringify(unique, null, 2)};\n`;
await writeFile(output, content, 'utf8');
console.log(`Generated ${unique.length} allowed Somon categories`);
