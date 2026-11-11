import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { catalogSearchCondition, catalogSearchTerms } from './catalogSearch.ts';

test('matches case, е/ё and hyphen variations while treating wildcards literally', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE samples (value TEXT)');
  const insert = db.prepare('INSERT INTO samples VALUES (?)');
  for (const value of ['УмНыЕ очки Wi‑Fi, ЧЁРНЫЙ', 'Товар [A]*? 100%_']) insert.run(value);
  const matches = (term: string) => {
    const { condition, patterns } = catalogSearchCondition(term, ['value']);
    return db.prepare(`SELECT value FROM samples WHERE ${condition}`).all(...patterns).map((row) => row.value);
  };
  for (const term of ['умные', 'УМнЫе', 'wifi', 'WI-FI', 'черный', 'ЧёРнЫй']) {
    assert.deepEqual(matches(term), ['УмНыЕ очки Wi‑Fi, ЧЁРНЫЙ'], term);
  }
  for (const term of ['[A]', '*', '?', '%_', ']']) {
    assert.deepEqual(matches(term), ['Товар [A]*? 100%_'], term);
  }
  assert.deepEqual(matches('несуществующий'), []);
  assert.deepEqual(matches('-'), []);
  assert.deepEqual(catalogSearchTerms('  очки   WiFi  очки '), ['очки', 'WiFi']);
  db.close();
});
