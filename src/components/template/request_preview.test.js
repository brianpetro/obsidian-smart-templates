import test from 'ava';
import { TemplateContextModal } from '../../modals/template_context_modal.js';
import { create_library } from '../../test_support/library.js';
import { deferred } from '../../test_support/bases.js';
import { post_process } from './request_preview.js';
import { element } from '../../test_support/template_dom.js';

async function modal_fixture(t) {
  const fixture = await create_library(t);
  const { env, item } = fixture;
  const ctx = { env, key: 'ctx', data: { context_items: {} }, emit_event() {}, get_text: async () => 'evidence' };
  const modal = new TemplateContextModal(ctx, { selected_template_keys: [item.key], user_message: 'first' });
  modal.refresh_request_panel = () => {};
  return { ...fixture, modal };
}

test('P5-10/11: preview and copy use the configured builder independently, not a shared cached output', async (t) => {
  const { env, item, modal } = await modal_fixture(t);
  let builds = 0; const copied = [];
  env.opts.items.smart_template = { actions: {
    template_build_prompt: { action(params) { builds += 1; return params.user_message; } },
    template_copy_with_context: { async action(params) { copied.push(await this.actions.template_build_prompt(params)); } },
  } };
  await modal.build_request_preview();
  t.is(modal.preview_text, 'first'); t.is(modal.preview_status, 'ready');
  modal.set_user_message('second');
  t.is(modal.preview_status, 'stale');
  await modal.run_copy_prompt_action();
  t.deepEqual(copied, ['second']); t.is(builds, 2);
  t.is(modal.preview_text, 'first');
});

test('P5 preview: latest invocation wins and input changes cancel a pending snapshot commit', async (t) => {
  const { env, modal } = await modal_fixture(t);
  const one = deferred(); const two = deferred(); let calls = 0;
  env.opts.items.smart_template = { actions: { template_build_prompt: { action() { return ++calls === 1 ? one.promise : two.promise; } } } };
  const first = modal.build_request_preview(); const second = modal.build_request_preview();
  two.resolve('second'); await second; one.resolve('old'); await first;
  t.is(modal.preview_text, 'second');
  const pending = deferred();
  // The bound action reads the current promise through a fresh configured fixture.
  const next = await modal_fixture(t);
  next.env.opts.items.smart_template = { actions: { template_build_prompt: { action: () => pending.promise } } };
  const build = next.modal.build_request_preview(); next.modal.set_user_message('changed');
  pending.resolve('stale'); await build;
  t.is(next.modal.preview_text, null); t.is(next.modal.preview_status, 'empty');
});

test('P5 preview: unavailable selection surfaces an error, never a clipboard effect', async (t) => {
  const { modal } = await modal_fixture(t);
  modal.set_selected_template_keys([]);
  await modal.build_request_preview();
  t.is(modal.preview_status, 'error'); t.regex(modal.preview_error, /Select/);
});

test('P5 copy: concurrent click/shortcut executes one effect; a new attempt is allowed afterward', async (t) => {
  const { env, modal } = await modal_fixture(t);
  const pending = deferred(); let calls = 0;
  env.opts.items.smart_template = { actions: { template_copy_with_context: { action() { calls += 1; return pending.promise; } } } };
  const first = modal.run_copy_prompt_action();
  await modal.run_copy_prompt_action(); t.is(calls, 1);
  pending.resolve('copied'); await first;
  await modal.run_copy_prompt_action(); t.is(calls, 2);
});

test('P5 preview component: text-only rendering and explicit disposal detach its refresh callback', (t) => {
  const root = element(); const pre = element(); const status = element(); const refresh = element();
  root.selectors.set('pre', pre); root.selectors.set('.st-template-request-preview__status', status);
  root.selectors.set('[data-preview-action="refresh"]', refresh);
  const modal = { preview_open: true, preview_status: 'ready', preview_text: '<script>literal</script>' };
  const controller = new AbortController();
  post_process.call({ attach_disposer() {} }, modal, root, { signal: controller.signal });
  t.is(pre.textContent, '<script>literal</script>'); t.false(root.hidden);
  t.regex(status.textContent, /independently/);
  controller.abort(); t.is(modal.preview_refresh, null);
});


test('P5 preview: close invalidates an in-flight build and a later result cannot restore sensitive text', async (t) => {
  const { env, modal } = await modal_fixture(t);
  const pending = deferred();
  env.opts.items.smart_template = { actions: { template_build_prompt: { action: () => pending.promise } } };
  const build = modal.build_request_preview();
  modal.onClose(); pending.resolve('request text'); await build;
  t.is(modal.preview_text, null); t.is(modal.preview_status, 'empty');
});
