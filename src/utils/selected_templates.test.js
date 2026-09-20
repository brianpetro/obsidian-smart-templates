import test from 'ava';
import { normalize_selected_template_keys, get_selected_template_items, get_merged_template_text } from './selected_templates.js';

test('P1-01/02: explicit ordered selections never receive a fallback', (t) => {
  t.deepEqual(normalize_selected_template_keys(['B', 'B', 'C'], 'A'), ['B', 'C']);
  t.deepEqual(normalize_selected_template_keys([], 'A'), []);
  t.deepEqual(normalize_selected_template_keys(undefined, 'A'), ['A']);
});

test('P1-03: strict resolution rejects missing and deleted keys; presentation can omit them', (t) => {
  const a = { key: 'A' };
  const b = { key: 'B', deleted: true };
  const env = { smart_templates: { get: (key) => ({ A: a, B: b })[key] } };
  t.throws(() => get_selected_template_items(env, { selected_template_keys: ['A', 'missing'], strict: true }, a), { message: /missing/ });
  t.throws(() => get_selected_template_items(env, { selected_template_keys: ['B'], strict: true }, a), { message: /B/ });
  t.deepEqual(get_selected_template_items(env, { selected_template_keys: ['missing'] }), []);
});

test('P1-09: template reads preserve selection order and current null behavior', async (t) => {
  const order = [];
  const items = ['B', 'A'].map((key) => ({ async get_template() { order.push(key); return key; } }));
  t.is(await get_merged_template_text(items), 'B\n\nA');
  t.deepEqual(order, ['B', 'A']);
  t.is(await get_merged_template_text([{ get_template: async () => null }]), '');
});

test('P1-03: a removed scope item cannot silently resolve itself; invalid explicit keys fail', (t) => {
  const item = { key: 'A' };
  const env = { smart_templates: { get: () => undefined } };
  t.throws(() => get_selected_template_items(env, { strict: true }, item), { message: /unavailable/ });
  t.throws(() => get_selected_template_items(env, { strict: true, selected_template_keys: ['A', 42] }, item), { message: /non-empty strings/ });
});
