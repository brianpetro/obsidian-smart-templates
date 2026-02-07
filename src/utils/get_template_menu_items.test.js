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
