import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importVariantInstructions } from './importAiPrompt.js';

test('omits SKU generation only when source variants are available', () => {
  const manyVariants = [{ raw_color: 'красный', image_url: 'https://example.test/a.jpg' }];
  const structured = importVariantInstructions(true, manyVariants);
  assert.match(structured.instructions, /будут сохранены отдельно/);
  assert.equal(structured.schema, '');
  assert.doesNotMatch(structured.instructions, /example\.test/);
  const unstructured = importVariantInstructions(false, manyVariants);
  assert.match(unstructured.schema, /"variants"/);
  assert.match(unstructured.instructions, /example\.test/);
});
