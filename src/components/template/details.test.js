import test from 'ava';
import { build_html, post_process } from './details.js';
import { create_library } from '../../test_support/library.js';
import { element, flush } from '../../test_support/template_dom.js';
import { deferred } from '../../test_support/bases.js';

function shell() {
  const root = element();
  for (const cls of ['status', 'content', 'actions']) root.selectors.set(`.st-template-details__${cls}`, element());
  return root;
}

test('P5 details: provenance counts are explained, keys are not fabricated, source-less items have no Open source', async (t) => {
  const { item } = await create_library(t);
  const html = build_html(item);
  t.true(html.includes('not a quality or confidence score'));
  t.true(html.includes('Supporting source keys were not recorded'));
  const root = shell();
  const controller = new AbortController();
  post_process.call({ attach_disposer() {} }, item, root, { signal: controller.signal });
  await flush();
  t.false(root.selectors.get('.st-template-details__actions').children.some((button) => button.dataset.detailsAction === 'template_open_source'));
  controller.abort();
});

test('P5 details: raw read output is assigned as text, and aborted read cannot write the panel', async (t) => {
  const { item } = await create_library(t);
  const root = shell(); const pending = deferred(); const controller = new AbortController(); let reads = 0;
  item.read = () => { reads += 1; return pending.promise; };
  post_process.call({ attach_disposer() {} }, item, root, { signal: controller.signal });
  t.is(reads, 1);
  controller.abort(); pending.resolve('<script>never executed</script>'); await flush();
  t.is(root.selectors.get('.st-template-details__content').textContent, '');
  const live = shell(); item.read = async () => '<script>literal</script>';
  post_process.call({ attach_disposer() {} }, item, live, {}); await flush();
  t.is(live.selectors.get('.st-template-details__content').textContent, '<script>literal</script>');
});

test('P5 details: existing read failure is surfaced without synthesizing template text', async (t) => {
  const { item } = await create_library(t); const root = shell();
  item.read = async () => { throw new Error('read failed'); };
  post_process.call({ attach_disposer() {} }, item, root, {}); await flush();
  t.regex(root.selectors.get('.st-template-details__status').textContent, /read failed/);
  t.is(root.selectors.get('.st-template-details__content').textContent, '');
});


test('UX-L4: Markdown precedes technical identity and details can close while a read is pending', async (t) => {
  const { item } = await create_library(t); const root = shell();
  const pending = deferred(); let closed = false;
  item.read = () => pending.promise;
  const html = build_html(item);
  t.true(html.indexOf('st-template-details__content') < html.indexOf('<dt>Identity'));
  t.true(html.includes('About this template'));
  const controller = new AbortController();
  post_process.call({ attach_disposer() {} }, item, root, { signal: controller.signal, on_close() { closed = true; controller.abort(); } });
  const button = element(); button.dataset.detailsAction = 'close';
  await root.dispatch('click', { target: { closest: () => button }, preventDefault() {} });
  t.true(closed); pending.resolve('Not rendered after closing'); await flush();
  t.is(root.querySelector('.st-template-details__content').textContent, '');
});

test('STAB-17: confirmed pending details honor the resolved retry title and retain queued ownership wording', async (t) => {
  const { item } = await create_library(t);
  item.actions.template_confirm();
  const root = shell(); const controller = new AbortController();
  post_process.call({ attach_disposer() {} }, item, root, { signal: controller.signal });
  t.is(root.querySelector('.st-template-details__actions').children.find((button) => button.dataset.detailsAction === 'template_confirm').textContent, 'Retry queued save');
  t.regex(build_html(item), /Confirmed inferred/); t.notRegex(build_html(item), /Saved inferred/);
  controller.abort();
});

test('STAB-18: source edits label a read snapshot without re-reading, including edits during an outstanding read', async (t) => {
  const { templates, env, listeners } = await create_library(t);
  const item = templates.get('Templates/Review.md');
  const root = shell(); const pending = deferred(); const controller = new AbortController(); let reads = 0;
  item.read = () => { reads += 1; return pending.promise; };
  const count = listeners.get('sources:modified').size;
  post_process.call({ attach_disposer() {} }, item, root, { signal: controller.signal });
  env.events.emit('sources:modified', { path: 'Unrelated.md' });
  t.is(root.querySelector('.st-template-details__status').textContent, 'Reading template...');
  env.events.emit('sources:modified', { path: 'Templates/Review.md', collection_key: 'smart_sources' });
  pending.resolve('Earlier content'); await flush();
  t.is(reads, 1); t.is(root.querySelector('.st-template-details__content').textContent, 'Earlier content');
  t.regex(root.querySelector('.st-template-details__status').textContent, /previous read/);
  item.read = async () => { reads += 1; return 'Current content'; };
  const button = element(); button.dataset.detailsAction = 'reload';
  await root.dispatch('click', { target: { closest: () => button }, preventDefault() {} });
  t.is(reads, 2); t.is(root.querySelector('.st-template-details__content').textContent, 'Current content');
  t.is(root.querySelector('.st-template-details__status').textContent, '');
  controller.abort(); t.is(listeners.get('sources:modified').size, count);
  env.events.emit('sources:modified', { path: 'Templates/Review.md' });
  t.is(root.querySelector('.st-template-details__status').textContent, '');
});

test('TASK-12: inspection-only reuse presents the full inert outline without Use/Keep or another request', async (t) => {
  const { item } = await create_library(t);
  const root = shell(); const controller = new AbortController();
  const html = build_html(item, { inspection_only: true });
  t.true(html.indexOf('<h3>Structure</h3>') < html.indexOf('About this template'));
  t.notRegex(html, /data-details-action="close"/);
  post_process.call({ attach_disposer() {} }, item, root, { signal: controller.signal, inspection_only: true });
  await flush();
  t.is(root.querySelector('.st-template-details__content').textContent, item.data.content);
  t.is(root.querySelector('.st-template-details__actions').children.length, 0);
  controller.abort();
});
