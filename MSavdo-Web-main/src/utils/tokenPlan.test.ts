import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestImportText, requestTokenPlanSuggestion } from './tokenPlan.js';

const product = { title: '灯', description: '', specifications: [{ name: 'Материал', value: 'Пластик' }] };
const categories = ['Туризм', 'Освещение'];

test('TokenPlan suggestions use the configured endpoint and validate each output', async () => {
  const replies = ['"Фонарь для кемпинга"', 'Описание товара с подтверждёнными характеристиками.', 'Туризм'];
  const prompts: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(input, 'https://tokenplan.lat/v1/chat/completions');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-key');
    assert.equal(init?.redirect, 'error');
    assert.equal(JSON.stringify(init?.body).includes('test-key'), false);
    prompts.push(JSON.parse(String(init?.body)).messages[0].content);
    return Response.json({ choices: [{ message: { content: replies.shift() } }] });
  };
  assert.equal(await requestTokenPlanSuggestion('test-key', 'title', product, categories, fetcher), 'Фонарь для кемпинга');
  assert.equal(await requestTokenPlanSuggestion('test-key', 'description', product, categories, fetcher), 'Описание товара с подтверждёнными характеристиками.');
  assert.equal(await requestTokenPlanSuggestion('test-key', 'category', product, categories, fetcher), 'Туризм');
  assert.match(prompts[0], /Полностью переведи название с китайского/);
  assert.match(prompts[1], /существенные подтверждённые характеристики/);
  await assert.rejects(requestTokenPlanSuggestion('test-key', 'category', product, categories,
    async () => Response.json({ choices: [{ message: { content: 'Неизвестно' } }] })), /вне каталога/);
});

test('rejects untranslated Chinese from title or description suggestions', async () => {
  for (const action of ['title', 'description'] as const) {
    await assert.rejects(requestTokenPlanSuggestion('test-key', action, product, categories,
      async () => Response.json({ choices: [{ message: { content: '灯具' } }] })), /китайские иероглифы/);
  }
});

test('TokenPlan errors do not expose key or use fallback', async () => {
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(requestTokenPlanSuggestion('test-key', 'title', product, categories,
      async () => Response.json({ error: 'test-key' }, { status })), (error: Error) => {
      assert.match(error.message, new RegExp(String(status)));
      assert.equal(error.message.includes('test-key'), false);
      return true;
    });
  }
});

test('import text uses a bounded prompt and validates structured results', async () => {
      let prompt = '';
      const result = await requestImportText('test-key', {
        title: 'T'.repeat(800), description: 'D'.repeat(10000),
        specifications: Array.from({ length: 60 }, (_, i) => ({ name: `spec-${i}`, value: 'V'.repeat(500) })),
      }, async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.max_tokens, 800);
        prompt = body.messages[0].content;
        return Response.json({ choices: [{ message: { content: '```json\n{"title":"Фонарь","description":"Компактный фонарь."}\n```' } }] });
      });
      assert.deepEqual(result, { title: 'Фонарь', description: 'Компактный фонарь.' });
      assert.equal(prompt.includes('D'.repeat(4001)), false);
      assert.equal(prompt.includes('spec-30'), false);
      await assert.rejects(requestImportText('test-key', product,
        async () => Response.json({ choices: [{ message: { content: '{"title":"灯","description":"Текст"}' } }] })), /некорректное название/);
      await assert.rejects(requestImportText('test-key', product,
        async () => Response.json({ choices: [{ message: { content: 'not json' } }] })), /некорректный JSON/);
});
