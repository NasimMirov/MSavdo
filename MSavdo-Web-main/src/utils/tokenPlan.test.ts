import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestTokenPlanSuggestion } from './tokenPlan.js';

const product = { title: '灯', description: '', specifications: [{ name: 'Материал', value: 'Пластик' }] };
const categories = ['Туризм', 'Освещение'];

test('TokenPlan suggestions use the configured endpoint and validate each output', async () => {
  const replies = ['Фонарь', 'Описание', 'Туризм'];
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(input, 'https://tokenplan.lat/v1/chat/completions');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-key');
    assert.equal(init?.redirect, 'error');
    assert.equal(JSON.stringify(init?.body).includes('test-key'), false);
    return Response.json({ choices: [{ message: { content: replies.shift() } }] });
  };
  assert.equal(await requestTokenPlanSuggestion('test-key', 'title', product, categories, fetcher), 'Фонарь');
  assert.equal(await requestTokenPlanSuggestion('test-key', 'description', product, categories, fetcher), 'Описание');
  assert.equal(await requestTokenPlanSuggestion('test-key', 'category', product, categories, fetcher), 'Туризм');
  await assert.rejects(requestTokenPlanSuggestion('test-key', 'category', product, categories,
    async () => Response.json({ choices: [{ message: { content: 'Неизвестно' } }] })), /вне каталога/);
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
