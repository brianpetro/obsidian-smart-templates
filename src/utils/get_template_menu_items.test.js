import test from 'ava';
import { get_template_menu_items } from './get_template_menu_items.js';

test('get_template_menu_items returns normalized sorted items and drops invalid entries', (t) => {
  const templates = [
    { key: 'z-last' },
    { data: { key: 'b-mid' } },
    { data: { source_key: 'a-first' } },
    null,
  ];

  const result = get_template_menu_items(templates);

  t.deepEqual(result.map((item) => item.label), ['a-first', 'b-mid', 'z-last']);
  t.is(result.length, 3);
});

test('get_template_menu_items deduplicates labels by keeping first seen item', (t) => {
  const first = { key: 'alpha', id: 1 };
  const second = { data: { key: 'alpha' }, id: 2 };

  const result = get_template_menu_items([second, first]);

  t.is(result.length, 1);
  t.is(result[0].template_item, second);
});

test('get_template_menu_items deduplicates labels case-insensitively', (t) => {
  const first = { key: 'Alpha Prompt', id: 1 };
  const second = { data: { key: 'alpha prompt' }, id: 2 };

  const result = get_template_menu_items([first, second]);

  t.is(result.length, 1);
  t.is(result[0].label, 'Alpha Prompt');
  t.is(result[0].template_item, first);
});

test('get_template_menu_items normalizes spaces and falls back to template title', (t) => {
  const result = get_template_menu_items([
    { data: { source_key: '   a   spaced   key   ' } },
    { metadata: { title: 'Beta title' } },
  ]);

  t.deepEqual(result.map((item) => item.label), ['a spaced key', 'Beta title']);
});
