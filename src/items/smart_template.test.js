import test from 'ava';
import { create_env } from '../test_support/templates.js';

test('P1/P2: unresolved source metadata is safe to render without changing read semantics', async (t) => {
  const { templates } = create_env(t);
  const item = templates.create_or_update({ key: 'gone.md', source_key: 'gone.md', content: null });
  t.deepEqual(item.metadata, {});
  t.is(await item.read(), null);
});

test('P1: existing source reads and compatibility strings still pass through as-is', async (t) => {
  let reads = 0;
  const sources = { 'A.md': { key: 'A.md', metadata: {}, async read() { reads += 1; return 'BLOCK NOT FOUND compatibility text'; } } };
  const { templates } = create_env(t, { sources });
  const item = templates.create_or_update({ key: 'A.md', source_key: 'A.md' });
  t.is(await item.read(), 'BLOCK NOT FOUND compatibility text');
  t.is(reads, 1);
  sources['A.md'].read = async () => '';
  t.is(await item.read(), null);
});
