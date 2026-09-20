import test from 'ava';
import { create_library } from '../test_support/library.js';
import { element, flush } from '../test_support/template_dom.js';
import { deferred } from '../test_support/bases.js';
import { TemplatesListView } from './templates_list_view.js';

test('P5-02/03: Use selected preserves ordered keys and frozen origin with no editor fallback', async (t) => {
  const { view, env, item, set_active_path } = await create_library(t);
  const calls = [];
  env.config.actions.template_open_context = { action(params) { t.is(this, env); calls.push(params); return {}; } };
  view.toggle_selected_template(item.key);
  view.toggle_selected_template('Templates/Review.md');
  set_active_path('B.md');
  await view.use_templates();
  t.deepEqual(calls[0].selected_template_keys, [item.key, 'Templates/Review.md']);
  t.deepEqual(calls[0].context_items, ['A.md']);
  t.is(calls[0].scope_source_key, 'A.md');
  t.true(calls[0].ignore_selection);
  view.apply_state({ scope_source_key: 'B.md' });
  t.is(calls[0].scope_source_key, 'A.md');
  t.deepEqual(view.list_state.selected_template_keys, []);
});

test('P5 handoff: explicit no-scope stays empty, duplicate click is suppressed, missing selection is not dropped', async (t) => {
  const { view, env, templates, item } = await create_library(t);
  const pending = deferred(); let calls = 0; let params;
  env.config.actions.template_open_context = { action(input) { calls += 1; params = input; return pending.promise; } };
  view.apply_state({ scope_source_key: null });
  const open = view.use_templates([item.key]);
  t.false(await view.use_templates([item.key]));
  t.deepEqual(params.context_items, []); t.is(params.scope_source_key, null);
  pending.resolve({}); await open; t.is(calls, 1);
  templates.items[item.key].deleted = true;
  await t.throwsAsync(() => view.use_templates([item.key, 'Templates/Review.md']), { message: /unavailable/ });
  t.is(calls, 1);
});

test('P5 navigation persistence has a strict whitelist; focused/selected data does not become content state', async (t) => {
  const { view, item } = await create_library(t);
  view.apply_state({ query: 'review', focused_template_key: item.key, context: 'secret', preview_text: 'private' });
  view.toggle_selected_template(item.key);
  t.deepEqual(view.getState(), { scope_source_key: 'A.md', query: 'review', focused_template_key: item.key });
  const saved = view.getState(); saved.query = 'changed externally';
  t.is(view.list_state.query, 'review');
});

test('P5-17: close during preparation prevents rendering and a delayed shared render cannot resurrect the leaf', async (t) => {
  const { view, templates, env, container } = await create_library(t);
  const pending = deferred(); let renders = 0;
  templates.prepare_templates = () => pending.promise;
  env.smart_components = { render_component() { renders += 1; return element(); } };
  const render = view.render_view();
  await view.onClose(); pending.resolve(); await render;
  await view.render_view();
  t.is(renders, 0); t.deepEqual(container.children, []);
});

test('P5-17: replaced render is aborted even before its component mounts', async (t) => {
  const { view, env, container } = await create_library(t);
  const first = deferred(); const second = element(); const signals = [];
  env.smart_components = { render_component(_key, _scope, params) {
    signals.push(params.signal);
    return signals.length === 1 ? first.promise : second;
  } };
  const one = view.render_view({ scope_source_key: 'A.md' }); await flush();
  await view.render_view({ scope_source_key: 'B.md' });
  first.resolve(element()); await one;
  t.true(signals[0].aborted); t.false(signals[1].aborted);
  t.is(container.children[0], second);
});

test('P5 rendering: preparation never requests derivation and component scope remains SmartTemplates', async (t) => {
  const { view, templates, env, reads } = await create_library(t);
  const baseline_reads = reads.length; const root = element();
  env.smart_components = { render_component(key, scope, params) {
    t.is(key, 'template_list'); t.is(scope, templates); t.is(params.view, view); return root;
  } };
  await view.render_view();
  t.is(reads.length, baseline_reads);
  t.is(TemplatesListView.default_open_location, 'tab');
});
