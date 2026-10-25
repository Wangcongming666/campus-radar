import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrivateEnv, compareCatalogs, migrationPlan } from './setup-local-api.mjs';

test('private env parser accepts quoted values without evaluating shell expressions', () => {
  assert.deepEqual(parsePrivateEnv('DATABASE_URL="postgresql://x:p@localhost/db"\nKEY=literal$(nope)\n#comment\n'), { DATABASE_URL: 'postgresql://x:p@localhost/db', KEY: 'literal$(nope)' });
  assert.throws(() => parsePrivateEnv('KEY=one\nKEY=two'), /Duplicate/);
});
test('catalog comparison refuses incomplete baseline and changed policies', () => {
  const expected = { 'column:users.id': { type: 'uuid' }, 'policy:users.self': { expression: 'owner' } };
  assert.deepEqual(compareCatalogs(expected, expected), []);
  assert.deepEqual(compareCatalogs(expected, { 'column:users.id': { type: 'uuid' } }), ['missing policy:users.self']);
  assert.deepEqual(compareCatalogs(expected, { ...expected, 'policy:users.self': { expression: 'true' } }), ['changed policy:users.self']);
  assert.deepEqual(compareCatalogs({}, { 'table:partial': {} }), ['unexpected table:partial']);
});
test('migration order preserves historical runtime before independent vector capability', () => {
  assert.deepEqual(migrationPlan.map((name) => name.slice(0, 4)), ['0001','0003','0004','0002','0005','0006','0007']);
});

test('future migrations append numerically without changing recorded historical order', async () => {
  const { discoverMigrations } = await import('./setup-local-api.mjs');
  const names = [...migrationPlan, '0010_followup.sql', '0009_account.sql', '0008_dates.sql', 'README.md'];
  assert.deepEqual(discoverMigrations(names), [...migrationPlan, '0008_dates.sql', '0009_account.sql', '0010_followup.sql']);
  assert.deepEqual(discoverMigrations(names, 7), migrationPlan);
  assert.throws(() => discoverMigrations([...names, '0009_duplicate.sql']), /Duplicate migration number/);
  assert.throws(() => discoverMigrations(names.filter((name) => name !== '0003_runtime_boundaries.sql')), /Missing historical migration/);
  assert.throws(() => discoverMigrations([...names, '0002_changed.sql']), /Duplicate migration number/);
});
