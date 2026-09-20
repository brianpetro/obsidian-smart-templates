import test from 'ava';
import { build_html } from './list.js';
import { create_library } from '../../test_support/library.js';
import { context_suggest_templates } from '../../actions/context-suggest/templates.js';
import { get_template_groups } from '../../utils/template_display.js';

test('P5-02: list and picker consume identical scoped identities, including source already in Context', async (t) => {
  const { templates, env } = await create_library(t);
  const params = { scope_source_key: 'A.md' };
  const expected = templates.get_visible_templates(params).map((item) => item.key).sort();
  const list = get_template_groups(templates.get_visible_templates(params)).flatMap((group) => group.records.map((row) => row.template_item.key)).sort();
  const ctx = { env, data: { context_items: { 'Templates/Review.md': {} } } };
  const modal = { env, params, get_selected_template_keys: () => [], setInstructions() {} };
  const picker = context_suggest_templates.call(ctx, { modal }).map((row) => row.key).sort();
  t.deepEqual(list, expected); t.deepEqual(picker, expected);
  t.true(list.includes('Templates/Review.md'));
});

test('UX-L1: compact library has secondary maintenance and no default batch-selection or empty inspector', (t) => {
  const html = build_html();
  for (const text of ['Refresh Base results', '>More<', 'Open Base', 'st-templates-library__details" hidden']) t.true(html.includes(text));
  for (const text of ['Generate', 'Create note', 'Save copy', 'model-select', 'use-selected', 'clear-selection', 'selection order']) t.false(html.includes(text));
});

/** Real parent post_process/actions with explicit child DOM stand-ins. Browser
 * coverage additionally mounts the actual SmartComponents and child renderers. */
async function mounted_list(t) {
  const { post_process } = await import('./list.js');
  const { element, flush } = await import('../../test_support/template_dom.js');
  const fixture = await create_library(t);
  const { templates, env, view } = fixture;
  const root = element();
  for (const selector of ['.st-templates-library__rows', '.st-templates-library__details',
    '.st-templates-library__feedback', 'input[type="search"]', '.st-templates-library__scope-input',
    '[data-library-action="open-base"]', '.st-templates-library__maintenance', '.st-templates-library__scope', '.st-templates-library__index']) {
    root.selectors.set(selector, element());
  }
  const calls = []; const rows = new Map(); const details = [];
  env.smart_components = { async render_component(key, scope, params) {
    calls.push({ key, scope, params });
    if (key === 'template_list_item') rows.set(scope.key, params);
    if (key === 'template_details') details.push(params);
    return element();
  } };
  const controller = new AbortController(); t.teardown(() => controller.abort());
  await post_process.call({ attach_disposer() {} }, templates, root, { view, signal: controller.signal });
  const settle = async () => { await flush(); await flush(); };
  return { ...fixture, root, calls, rows, details, controller, settle,
    row_count: () => calls.filter((call) => call.key === 'template_list_item').length };
}

test('STAB-19: actual list controller never remounts rows or starts reads/inference for unrelated edits', async (t) => {
  const { env, calls, row_count, reads, templates, settle } = await mounted_list(t);
  const count = row_count(); const read_count = reads.length;
  const revision = templates.discovery_adapters.derived_headings.get_snapshot().revision;
  for (let i = 0; i < 20; i += 1) env.events.emit('sources:modified', { path: 'Other.md', collection_key: 'smart_sources' });
  await settle();
  t.is(row_count(), count); t.is(reads.length, read_count);
  t.is(templates.discovery_adapters.derived_headings.get_snapshot().revision, revision);
  t.is(templates.discovery_adapters.derived_headings.get_snapshot().status, 'stale');
  t.is(calls.filter((call) => call.key === 'template_details').length, 0);
});

test('STAB-20: topology remounts only affected catalog rows; recreation restores the committed membership', async (t) => {
  const { env, row_count, rows, templates, settle } = await mounted_list(t);
  const count = row_count();
  env.events.emit('sources:created', { path: 'Elsewhere.md' }); await settle();
  t.is(row_count(), count);
  const source = env.smart_sources.get('Templates/Review.md');
  delete env.smart_sources.items[source.key];
  env.events.emit('sources:deleted', { path: source.key }); await settle();
  t.true(row_count() > count); t.false(templates.get_visible_templates().some((item) => item.key === source.key));
  const after_delete = row_count();
  env.smart_sources.items[source.key] = source;
  env.events.emit('sources:created', { path: source.key }); await settle();
  t.true(row_count() > after_delete); t.truthy(rows.get(source.key));
  t.true(templates.get_visible_templates().some((item) => item.key === source.key));
});

test('STAB-21: actual list routes confirm/retry via current actions, observes dirty flags and preserves focus', async (t) => {
  const { item, templates, env, root, rows, details, view, row_count, settle } = await mounted_list(t);
  rows.get(item.key).on_focus(); await settle();
  const key = item.key;
  await details.at(-1).on_action(item, 'template_confirm'); await settle();
  t.is(templates.get(key), item); t.false(item.data.transient); t.is(view.list_state.focused_template_key, key);
  t.is(root.querySelector('.st-templates-library__feedback').textContent, '');
  t.is(rows.get(key).feedback, 'Added to your templates.');
  const data = item.data; let requeues = 0; const queue = templates.queue_save.bind(templates);
  templates.queue_save = () => { requeues += 1; queue(); };
  await details.at(-1).on_action(item, 'template_confirm'); await settle();
  t.is(requeues, 1); t.is(item.data, data);
  t.regex(rows.get(key).feedback, /queued again/);
  const count = row_count();
  env.events.emit('collection:save_completed', { collection_key: 'smart_sources' }); await settle();
  t.is(row_count(), count);
  await templates.process_save_queue(); await settle();
  t.false(item._queue_save); t.true(row_count() > count);
  t.false(env.resolve_menu_actions('template:action_menu', item).some((entry) => entry.action_key === 'template_confirm'));
});

test('STAB-22: failed same-action retry stays pending, reports failure, and disposal blocks queued rerenders', async (t) => {
  const { item, templates, env, root, rows, calls, row_count, controller, listeners, settle } = await mounted_list(t);
  rows.get(item.key).on_action(item, 'template_confirm', {}); await settle();
  t.false(item.data.transient);
  templates.queue_save = () => { throw new Error('expected retry scheduling error'); };
  rows.get(item.key).on_action(item, 'template_confirm', {}); await settle();
  t.true(item._queue_save); t.false(item.data.transient);
  t.regex(rows.get(item.key).feedback, /retry scheduling error/);
  t.is(root.querySelector('.st-templates-library__feedback').textContent, '');
  const count = row_count();
  env.events.emit('templates:index_changed', { collection_key: 'smart_templates' });
  controller.abort(); await settle();
  t.is(row_count(), count);
  t.is(listeners.get('collection:save_completed').size, 0);
  t.true(calls.filter((call) => call.key === 'template_list_item').every((call) => call.params.signal.aborted));
});
