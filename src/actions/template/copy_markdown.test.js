import test from 'ava';
import { create_library } from '../../test_support/library.js';

function clipboard(t, write) {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: write } } });
  t.teardown(() => { if (old) Object.defineProperty(globalThis, 'navigator', old); else delete globalThis.navigator; });
}

test.serial('P5-08/09: configured read once, literal raw content copied, no prompt compiler involved', async (t) => {
  const { item, env } = await create_library(t);
  const content = '---\nprompt: retain\n---\n```smart-template-variables\n{}\n```\n';
  let reads = 0; const copied = [];
  env.opts.items.smart_template = { actions: { template_read: { action() { reads += 1; t.is(this, item); return content; } } } };
  clipboard(t, async (text) => copied.push(text));
  t.is(await item.actions.template_copy_markdown(), content);
  t.is(reads, 1); t.deepEqual(copied, [content]);
});

test.serial('P5-09: clipboard failure rejects, and unavailable read does not write', async (t) => {
  const { item } = await create_library(t);
  let writes = 0;
  clipboard(t, async () => { writes += 1; throw new Error('denied'); });
  await t.throwsAsync(() => item.actions.template_copy_markdown(), { message: /Unable to copy/ });
  t.is(writes, 1);
  item.read = async () => null;
  await t.throwsAsync(() => item.actions.template_copy_markdown(), { message: /unavailable/ });
  t.is(writes, 1);
});
