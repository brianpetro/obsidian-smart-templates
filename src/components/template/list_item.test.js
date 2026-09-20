import test from 'ava';
import { build_html, post_process } from './list_item.js';
import { create_library } from '../../test_support/library.js';
import { element } from '../../test_support/template_dom.js';

test('P5 row: readable labels, direct Use, inspection-owned Keep and inline retry and escaped authored text', async (t) => {
  const { item } = await create_library(t);
  item.data.name = '<script>not executable</script>';
  let html = build_html(item, { selected: true, selection_order: 2 });
  t.true(html.includes('&lt;script&gt;not executable&lt;/script&gt;'));
  t.false(html.includes('<script>'));
  t.false(html.includes('template_confirm')); t.false(html.includes('checkbox'));
  t.true(html.includes('Use template')); t.false(html.includes('Keep template'));  
  item.actions.template_confirm(); html = build_html(item);
  t.true(html.includes('Retry queued save'));
  t.false(html.includes('Saved inferred'));
  await item.collection.process_save_queue();
  html = build_html(item);
  t.false(html.includes('data-row-action="template_confirm"'));
  t.false(html.includes('Saved inferred'));
});

test('P5 row: inspection and Use remain separate, and aborted rows no longer invoke controls', async (t) => {
  const { item } = await create_library(t);
  const root = element();
  const controller = new AbortController(); const calls = [];
  post_process.call({ attach_disposer() {} }, item, root, { signal: controller.signal,
    on_focus: (value) => calls.push(['focus', value]), on_use: (value) => calls.push(['use', value]), on_menu() {}, on_action() {},
  });
  const button = element(); button.classList.add('st-template-row__inspect');
  await root.dispatch('click', { target: { closest: () => button }, preventDefault() {} });
  t.deepEqual(calls, [['focus', item]]);
  button.classList.remove('st-template-row__inspect'); button.classList.add('st-template-row__use');
  await root.dispatch('click', { target: { closest: () => button }, preventDefault() {} });
  t.deepEqual(calls[1], ['use', item]);
  controller.abort(); await root.dispatch('click', { target: { closest: () => button } }); t.is(calls.length, 2);
});

test('TASK-13: recurring rows show last-scan recurrence without coverage badges or repeated Keep controls', async (t) => {
  const { item } = await create_library(t);
  const html = build_html(item);
  t.regex(html, /Found in 2 notes during the last scan/);
  t.notRegex(html, /% of eligible|st-template-row__origin|data-row-action="template_confirm"/);
  t.regex(html, /Use template/);
  item.actions.template_confirm();
  const pending = build_html(item, { feedback: 'Added <this> to your templates.' });
  t.regex(pending, /Retry queued save|Saving queued/);
  t.regex(pending, /Added &lt;this&gt;/); t.notRegex(pending, /Saved inferred/);
});
