import test from 'ava';
import { TemplateContextModal } from './template_context_modal.js';
import { create_env } from '../test_support/templates.js';
import { build_html } from '../components/template/request_panel.js';

function create_modal(t, params = {}) {
  const { templates, env } = create_env(t);
  templates.create_or_update({ key: 'A', content: '---\nprompt: Instructions A\n---\n## A' });
  templates.create_or_update({ key: 'B', content: '---\nprompt: Instructions B\n---\n## B' });
  env.resolve_menu_actions = () => [
    { action_key: 'different_naming', order: 1 },
    { action_key: 'disabled_mode', disabled: true },
    { action_key: 'menu_builder', menu_only: true },
  ];
  const ctx = { env, key: 'ctx', data: { context_items: { A: { key: 'A' } } }, emit_event() {} };
  const modal = new TemplateContextModal(ctx, params);
  modal.refresh_request_panel = () => {};
  return { modal, templates, env };
}

test('P1-04: automatic defaults switch with selection; an explicit clear stays empty', (t) => {
  const { modal } = create_modal(t);
  modal.set_selected_template_keys(['A']);
  t.is(modal.get_resolved_user_message(), 'Instructions A');
  t.false(modal.user_message_touched);
  modal.set_selected_template_keys(['B']);
  t.is(modal.get_resolved_user_message(), 'Instructions B');
  modal.set_user_message('');
  modal.set_selected_template_keys(['A']);
  t.true(modal.user_message_touched);
  t.is(modal.get_resolved_user_message(), '');
  t.false(build_html(modal).includes('Instructions A'));
});

test('P1-04: constructor/open synchronization does not mistake internally seeded state for an edit', (t) => {
  const { modal } = create_modal(t);
  modal.sync_request_state_from_params({});
  modal.set_selected_template_keys(['A']);
  t.false(modal.user_message_touched);
  t.is(modal.request_state.user_message, 'Instructions A');
  const explicit = create_modal(t, { user_message: '', selected_template_keys: ['A'] }).modal;
  t.true(explicit.user_message_touched);
  t.is(explicit.get_resolved_user_message(), '');
});

test('P2-17: template selection bypasses evidence membership; context suggestions retain filtering', (t) => {
  const { modal } = create_modal(t);
  const rows = [{ key: 'A' }, { key: 'B' }];
  modal.is_template_suggest_mode = true;
  t.is(modal.filter_suggestions(rows), rows);
  modal.is_template_suggest_mode = false;
  t.deepEqual(modal.filter_suggestions(rows), [{ key: 'B' }]);
});

test('P2: placed actions need no naming prefix; explicit empty allowlist remains empty', (t) => {
  const { modal } = create_modal(t);
  t.deepEqual(modal.build_context_suggest_action_keys(), ['different_naming']);
  t.deepEqual(modal.build_context_suggest_action_keys({ default_suggest_action_keys: [] }), []);
  const empty = create_modal(t, { default_suggest_action_keys: [] }).modal;
  t.deepEqual(empty.default_suggest_action_keys, []);
});

test('P1/P2: an empty Context-mode allowlist stays empty after template-mode navigation', (t) => {
  const { modal } = create_modal(t, { default_suggest_action_keys: [] });
  // Template mode clears the active fuzzy override, not the saved Context policy.
  modal.params.default_suggest_action_keys = null;
  t.deepEqual(modal.default_suggest_action_keys, []);
});

test('P1-04: real modal open path does not reinterpret internally seeded params as user input', (t) => {
  const { modal } = create_modal(t);
  modal.modalEl = { addEventListener() {} };
  modal.render = async () => {};
  modal.open({});
  t.false(modal.user_message_touched);
  modal.set_selected_template_keys(['A']);
  t.is(modal.get_resolved_user_message(), 'Instructions A');
});

test('TASK-04: a preselected request opens in composer mode, while first selection remains context-first', (t) => {
  const { modal } = create_modal(t, { selected_template_keys: ['A'], user_message: '' });
  modal.smart_context.has_context_items = true;
  modal.prime_initial_suggestions({});
  t.false(modal.picker_open); t.false(modal.is_template_suggest_mode);
  t.deepEqual(modal.get_suggestions(), []);
  const fresh = create_modal(t).modal;
  fresh.smart_context.has_context_items = true;
  fresh.smart_context.actions = { context_suggest_templates: () => [{ key: 'A' }] };
  fresh.prime_initial_suggestions({});
  t.true(fresh.picker_open); t.true(fresh.is_template_suggest_mode);
  t.deepEqual(fresh.suggestions, [{ key: 'A' }]);
});

test('TASK-05: Done and reopening selection preserve ordered toggles, exact Context and explicit blank instructions', async (t) => {
  const { modal } = create_modal(t, { user_message: '', scope_source_key: 'Frozen.md' });
  const ctx = modal.smart_context;
  ctx.actions = { context_suggest_templates: () => [{ key: 'A' }, { key: 'B' }] };
  modal.open_template_suggest();
  modal.toggle_selected_template_key('B'); modal.toggle_selected_template_key('A');
  t.true(modal.picker_open); t.deepEqual(modal.get_selected_template_keys(), ['B', 'A']);
  modal.finish_picker();
  t.false(modal.picker_open); t.deepEqual(modal.get_selected_template_keys(), ['B', 'A']);
  modal.open_template_suggest();
  modal.toggle_selected_template_key('B'); modal.toggle_selected_template_key('B');
  t.deepEqual(modal.get_selected_template_keys(), ['A', 'B']);
  t.is(modal.smart_context, ctx); t.is(modal.get_resolved_user_message(), '');
  t.is(modal.params.scope_source_key, 'Frozen.md');
  modal.finish_picker();
});

test('TASK-06: late picker responses after Done or a mode switch cannot replace current rows', async (t) => {
  const { modal } = create_modal(t);
  let release;
  modal.picker_open = true;
  const pending = modal.update_suggestions(() => new Promise((resolve) => { release = resolve; }));
  modal.finish_picker(); release([{ key: 'late' }]); await pending;
  t.notDeepEqual(modal.suggestions, [{ key: 'late' }]);
  modal.picker_open = true;
  const old = modal.update_suggestions(() => new Promise((resolve) => { release = resolve; }));
  await modal.update_suggestions([{ key: 'current' }]);
  release([{ key: 'old' }]); await old;
  t.deepEqual(modal.suggestions, [{ key: 'current' }]);
});

test('TASK-07: late row handlers cannot redraw a closed picker; hidden picker shortcuts do not select', async (t) => {
  const { modal } = create_modal(t);
  let release; let draws = 0;
  modal.picker_open = true;
  modal.updateSuggestions = () => { draws += 1; };
  const operation = modal.handle_choose_action({ key: 'A', select_action: () => new Promise((resolve) => { release = resolve; }) }, 'select_action');
  modal.finish_picker(); release([{ key: 'late' }]); await operation;
  t.is(draws, 0);
  modal.use_mod_select = true; modal.use_shift_select = true;
  t.notThrows(() => modal.selectActiveSuggestion({ target: {} }));
  t.false(modal.use_mod_select); t.false(modal.use_shift_select);
  t.notThrows(() => modal.onChooseSuggestion({ item: { key: 'A' } }));
  t.deepEqual(modal.get_selected_template_keys(), []);
});

test('TASK-08: rendered error is local, truthful and ignored after modal disposal', (t) => {
  const { modal } = create_modal(t);
  const feedback = { textContent: '' };
  modal.request_panel_el = { querySelector: () => feedback };
  modal.handle_primary_action_error(new Error('read failed'));
  t.is(feedback.textContent, 'read failed');
  modal.closed = true;
  modal.handle_primary_action_error(new Error('late failure'));
  t.is(feedback.textContent, 'read failed');
});

test('TASK-15: an empty prepared picker is final rather than a loop of source-mode refreshes', (t) => {
  const { modal } = create_modal(t);
  modal.picker_open = true; modal.suggestions = [];
  modal.run_suggest_action = () => t.fail('Repeated an empty source action');
  t.deepEqual(modal.get_suggestions(), []);
  modal.suggestions = [{ key: 'A' }]; modal.is_template_suggest_mode = false;
  t.deepEqual(modal.get_suggestions(), [], 'all selected Context rows are legitimately empty');
});

test('TASK-16: typing during an asynchronous panel replacement preserves the latest text and cursor', async (t) => {
  const { element } = await import('../test_support/template_dom.js');
  const { modal, env } = create_modal(t, { user_message: '' });
  const old = element(); const previous = element();
  previous.selectionStart = 7; previous.selectionEnd = 7;
  old.selectors.set('.st-template-request-panel__textarea', previous);
  const next = element(); const input = element();
  input.setSelectionRange = (start, end) => { input.selectionStart = start; input.selectionEnd = end; };
  next.selectors.set('.st-template-request-panel__textarea', input);
  modal.modalEl = { ownerDocument: { activeElement: previous } };
  modal.request_panel_el = old; modal.request_pane_el = element(); modal.ensure_workspace_layout = () => {};
  let release;
  env.smart_components = { render_component: () => new Promise((resolve) => { release = resolve; }) };
  const pending = modal.render_request_panel();
  modal.set_user_message('Newest typed instructions');
  release(next); await pending;
  t.is(input.value, 'Newest typed instructions'); t.true(input.focused);
  t.is(input.selectionStart, 7); t.is(modal.get_resolved_user_message(), input.value);
  modal.request_panel_controller.abort();
});


test('TASK-17: pending replacement cancellation never disables the mounted request before successful commit', async (t) => {
  const { element } = await import('../test_support/template_dom.js');
  const { modal, env } = create_modal(t);
  modal.modalEl = element(); modal.ensure_workspace_layout = () => {};
  modal.request_panel_el = element(); modal.request_pane_el = element();
  const mounted = new AbortController();
  modal.request_panel_controller = mounted;
  modal.mounted_request_panel_controller = mounted;
  const releases = [];
  env.smart_components = { render_component: () => new Promise((resolve) => releases.push(resolve)) };
  const older = modal.render_request_panel(); const pending = modal.request_panel_controller;
  const newer = modal.render_request_panel();
  t.true(pending.signal.aborted); t.false(mounted.signal.aborted);
  releases[0](element()); await older;
  t.false(mounted.signal.aborted);
  releases[1](element()); await newer;
  t.true(mounted.signal.aborted);
  t.is(modal.mounted_request_panel_controller, modal.request_panel_controller);
  modal.request_panel_controller.abort();
});
