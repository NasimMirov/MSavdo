export type ProductSuggestionAction = 'title' | 'description' | 'category';
const API_URL = (typeof process !== 'undefined' && process.env?.TOKENPLAN_API_URL?.trim()) || 'https://tokenplan.art/v1/chat/completions';
const MODEL = (typeof process !== 'undefined' && process.env?.TOKENPLAN_MODEL?.trim()) || 'gemini-3.8-flash';
const tasks: Record<ProductSuggestionAction, string> = {
  title: 'Перепиши название товара по-русски кратко и точно. Сохрани модель, размер и количество. Удали рекламу. Верни только название.',
  description: 'Напиши описание товара на русском в 2–5 предложениях только по подтверждённым данным. Не выдумывай факты, цену или доставку. Верни только описание.',
  category: 'Выбери одну категорию строго из списка и верни только её точное название.',
};
export async function requestTokenPlanSuggestion(key: string, action: ProductSuggestionAction, data: { title: string; description: string; specifications: Array<{ name: string; value: string }> }, categories: string[], fetcher: typeof fetch = fetch): Promise<string> {
  const specifications = data.specifications.map((item) => { const color = /^Фото цвета:\s*(.+)$/i.exec(item.name.trim()); return color ? { name: 'Цвет', value: color[1].trim() } : item; });
  const prompt = ['Ты редактор магазина M.Savdo.', tasks[action], action === 'category' ? `Список категорий: ${JSON.stringify(categories)}` : '', `Данные товара: ${JSON.stringify({ ...data, specifications })}`].filter(Boolean).join('\n');
  let response: Response;
  try {
    const request = { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.2 }), redirect: 'error' as RequestRedirect, signal: AbortSignal.timeout(60000) };
    response = await fetcher(API_URL, request);
    if (response.status === 503 || response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      response = await fetcher(API_URL, request);
    }
  } catch { throw new Error('Не удалось связаться с TokenPlan. Проверьте соединение и повторите.'); }
  if (!response.ok) { if (response.status === 401) throw new Error('TokenPlan отклонил ключ (HTTP 401). Проверьте ключ.'); if (response.status === 403) throw new Error('TokenPlan запретил доступ (HTTP 403).'); if (response.status === 402 || response.status === 429) throw new Error(`TokenPlan: HTTP ${response.status}. Проверьте баланс и лимиты.`); throw new Error(`TokenPlan вернул ошибку HTTP ${response.status}.`); }
  let body: any; try { body = await response.json(); } catch { throw new Error('TokenPlan вернул некорректный ответ.'); }
  const content = body?.choices?.[0]?.message?.content; if (typeof content !== 'string' || !content.trim()) throw new Error('TokenPlan вернул пустой ответ.');
  const result = content.trim().replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/, '').replace(/^['"“”]|['"“”]$/g, '').trim();
  if (action !== 'category' && /[\u3400-\u9fff]/.test(result)) throw new Error('TokenPlan оставил китайские иероглифы. Повторите запрос.');
  if (action === 'category' && !categories.includes(result)) throw new Error('TokenPlan вернул категорию вне каталога. Повторите запрос.');
  if ((action === 'title' && result.length > 500) || (action === 'description' && result.length > 20000)) throw new Error('Ответ TokenPlan слишком длинный.');
  return result;
}
