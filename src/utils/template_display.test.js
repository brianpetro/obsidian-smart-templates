import test from 'ava';
import { get_template_name, get_template_groups, get_template_origin, get_template_support, sort_template_records, dedupe_template_records } from './template_display.js';
import { format_selected_templates_label, format_selected_templates_meta } from './selected_templates.js';
import { create_library } from '../test_support/library.js';

test('P5 names: inferred/confirmed labels use structure rather than opaque hash identity', async (t) => {
  const { item } = await create_library(t);
  const key = item.key;
  t.is(get_template_name(item), 'Why / Next');
  t.is(format_selected_templates_label([item]), 'Why / Next');
  t.is(get_template_origin(item), 'Suggested');
  t.is(format_selected_templates_meta([item]), 'Suggested template');
  item.actions.template_confirm();
  t.is(item.key, key);
  t.is(get_template_name(item), 'Why / Next');
  t.is(get_template_origin(item), 'Confirmed inferred');
  t.is(format_selected_templates_meta([item]), 'Confirmed inferred template');
});

test('P5-04/12: groups/search are presentation-only and retain the configured derived ranking', async (t) => {
  const { templates, item } = await create_library(t);
  const second = templates.create_or_update({ key: 'derived_headings:000', content: '## Aardvark', transient: true, provider_key: 'derived_headings' });
  const items = [item, second, templates.get('Templates/Review.md')];
  const before = [...items];
  const groups = get_template_groups(items);
  t.deepEqual(groups.map((group) => group.section), ['Available', 'Suggested']);
  t.deepEqual(groups[1].records.map((record) => record.template_item), [item, second]);
  t.deepEqual(sort_template_records(dedupe_template_records([item, second])).map((record) => record.template_item), [item, second]);
  t.deepEqual(get_template_groups(items, 'Templates/Review')[0].records.map((record) => record.template_item.key), ['Templates/Review.md']);
  t.deepEqual(items, before);
  t.is(get_template_name(templates.get('Templates/Review.md')), 'Review');
  t.regex(get_template_support(item), /2 supporting sources/);
});

test('P5-13/14: confirmation changes group but not identity, and Base policy retains global saved inline items', async (t) => {
  const { templates, item } = await create_library(t);
  t.is(get_template_groups([item])[0].section, 'Suggested');
  item.actions.template_confirm();
  t.is(get_template_groups([item])[0].section, 'Available');
  templates.set_base_settings({ template_base: 'Absent.base', template_base_view: '', template_base_scopes: '' });
  t.true(templates.get_visible_templates({ scope_source_key: 'A.md' }).includes(item));
});


test('UX-L3: built-in display suffix is omitted without rekeying or collapsing distinct identities', async (t) => {
  const { templates } = await create_library(t);
  const item = templates.get('Create summary (default)');
  t.is(get_template_name(item), 'Create summary');
  t.is(item.key, 'Create summary (default)');
  t.is(templates.get(item.key), item);
  t.true(templates.get('Diagram (default)') !== templates.get('Mermaid diagram (default)'));
});
