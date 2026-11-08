import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldSeedDemoProducts } from './demoSeed.js';

test('never inserts demo products into an empty production catalog', () => {
  assert.equal(shouldSeedDemoProducts('production', 0), false);
  assert.equal(shouldSeedDemoProducts('production', 4), false);
  assert.equal(shouldSeedDemoProducts('development', 0), true);
  assert.equal(shouldSeedDemoProducts('development', 1), false);
});
