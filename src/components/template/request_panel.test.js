import test from 'ava';
import { build_html, post_process, get_context_summary } from './request_panel.js';
import { element, flush } from '../../test_support/template_dom.js';

function mounted_panel(modal) {
  const root = element();
  const textarea = element(); root.selectors.set('.st-template-request-panel__textarea', textarea);
  const controller = new AbortController();
  post_process.call({ attach_disposer() {} }, modal, root, { signal: controller.signal });
  const invoke = (action) => root.dispatch('click', {
    target: { closest: () => ({ getAttribute: () => action }) }, preventDefault() {}, stopPropagation() {},
  });
  return { root, textarea, controller, invoke };
}

test('P3 request controls: maintenance is absent from composition rather than operating on its frozen request', async (t) => {
  let updated = 0;
  const modal = { params: { scope_source_key: 'Frozen.md' }, request_state: {},
    env: { smart_templates: { actions: { smart_templates_update_index() { updated += 1; } } } },
  };
  const { invoke, controller } = mounted_panel(modal);
  t.notRegex(build_html(modal), /Template index|update-index|Open Base|st-template-index-status/);
  await invoke('update-index'); t.is(updated, 0); t.is(modal.params.scope_source_key, 'Frozen.md');
  controller.abort();
});

test('UX-L2: requests retain the existing picker and never route selection into a new library request', async (t) => {
  let selected = 0; let browsed = 0;
  const modal = { params: {}, request_state: { user_message: 'Existing instructions' },
    env: { smart_templates: { actions: { smart_templates_open_list() { browsed += 1; } } } },
    get_selected_templates: () => [], open_template_suggest() { selected += 1; },
  };
  const html = build_html(modal);
  t.false(html.includes('browse-templates')); t.true(html.includes('select-template'));
  const { invoke, controller } = mounted_panel(modal);
  await invoke('select-template'); await invoke('browse-templates');
  t.is(selected, 1); t.is(browsed, 0); t.is(modal.request_state.user_message, 'Existing instructions');
  controller.abort();
});

test('TASK-01: Context summary uses recorded identities/excerpts, ordering and exclusions without hydration or reads', (t) => {
  const ctx = { data: { context_items: {
    note: { key: 'note', title: 'Evidence.md', at: 2 },
    'selection:123': { kind: 'text', content: '<script>only text</script>', at: 1 },
    folder: { folder: true, source_path: 'Projects', at: 3 },
    ignored: { exclude: true },
  } }, get context_items() { t.fail('UI hydrated Context'); }, get_text() { t.fail('UI compiled Context'); } };
  t.deepEqual(get_context_summary(ctx).map((item) => item.label), ['Selected text', 'Evidence.md', 'Folder: Projects']);
  const html = build_html({ smart_context: ctx, env: {}, request_state: {}, get_selected_templates: () => [] });
  t.regex(html, /&lt;script&gt;only text&lt;\/script&gt;/); t.notRegex(html, /<script>|ignored/);
  t.true(html.indexOf('Request context') < html.indexOf('Selected structure'));
  t.true(html.indexOf('Selected structure') < html.indexOf('Instructions'));
  t.true(html.indexOf('Instructions') < html.indexOf('Copy prompt'));
});

test('TASK-02: Review delegates the same exact Context and Add stays in this modal; disposal blocks dispatch', async (t) => {
  const calls = [];
  const modal = { env: {}, smart_context: { emit_event(name) { calls.push(name); } },
    finish_picker() { calls.push('done'); }, open_context_suggest() { calls.push('add'); },
  };
  const { invoke, controller } = mounted_panel(modal);
  await invoke('review-context'); await invoke('open-context');
  t.deepEqual(calls, ['done', 'context_selector:open', 'add']);
  controller.abort(); await invoke('review-context'); t.is(calls.length, 3);
});

test('TASK-03: local request error and keyboard Copy preserve explicit textarea text', async (t) => {
  const calls = []; const modal = { env: {}, set_user_message(value) { calls.push(value); },
    async run_primary_action() { throw new Error('clipboard denied'); }, handle_primary_action_error(error) { calls.push(error.message); } };
  const { invoke, controller, root, textarea } = mounted_panel(modal);
  await textarea.dispatch('input', { target: { value: '' } });
  await invoke('run-primary');
  await root.dispatch('keydown', { key: 'Enter', ctrlKey: true, preventDefault() {}, stopPropagation() {} });
  t.deepEqual(calls, ['', 'clipboard denied', 'clipboard denied']);
  controller.abort(); await flush();
});
