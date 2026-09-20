import test from 'ava';
import { template_copy_with_context } from './copy_with_context.js';
import { create_env } from '../../test_support/templates.js';

function set_clipboard(t, write_text) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: write_text } } });
  t.teardown(() => {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  });
}

test.serial('P1-07: actual action proxy selects item overlay once and copies that exact text', async (t) => {
  let calls = 0;
  const copied = [];
  set_clipboard(t, async (text) => copied.push(text));
  const { templates, env, events } = create_env(t, { actions: {
    template_copy_with_context: { action: template_copy_with_context },
    template_build_prompt: { action() { t.fail('base implementation should be overlaid'); } },
  } });
  const item = templates.create_or_update({ key: 'A', content: 'A' });
  env.opts.items.smart_template = { actions: { template_build_prompt: { action(params) {
    calls += 1; t.is(this, item); t.deepEqual(params.selected_template_keys, ['B']); return 'OVERRIDE';
  } } } };
  t.is(await item.actions.template_copy_with_context({ ctx: { key: 'ctx' }, selected_template_keys: ['B'] }), 'OVERRIDE');
  t.is(calls, 1);
  t.deepEqual(copied, ['OVERRIDE']);
  t.true(events.some(([key]) => key === 'templates:prompt_copied'));
});

test.serial('P1-08: real clipboard helper failure rejects without Templates success', async (t) => {
  set_clipboard(t, async () => { throw new Error('denied'); });
  const { templates, events } = create_env(t, { actions: { template_build_prompt: { action: () => 'text' } } });
  const item = templates.create_or_update({ key: 'A', content: 'A' });
  await t.throwsAsync(() => template_copy_with_context.call(item), { message: /could not be copied/ });
  t.false(events.some(([key]) => key === 'templates:prompt_copied' || key === 'template:copied'));
});

test.serial('P1: skip_notice retains natural result and item success event only', async (t) => {
  set_clipboard(t, async () => {});
  const { templates, events } = create_env(t, { actions: { template_build_prompt: { action: () => 'text' } } });
  const item = templates.create_or_update({ key: 'A', content: 'A' });
  t.is(await template_copy_with_context.call(item, { skip_notice: true }), 'text');
  t.true(events.some(([key]) => key === 'template:copied'));
  t.false(events.some(([key]) => key === 'templates:prompt_copied'));
});
