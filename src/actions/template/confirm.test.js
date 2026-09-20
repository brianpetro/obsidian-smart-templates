import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run_action_entry } from 'smart-environment/utils/action_entry.js';
import { create_heading_env } from '../../test_support/heading_inference.js';
import { smart_env_config } from '../../default.config.js';

const documents = { 'A.md': '## Why\n\n## Next\n', 'B.md': '## Why\n\n## Next\n' };
async function prepared(t, opts = {}) {
  const fixture = create_heading_env(t, { documents, ...opts });
  await fixture.templates.actions.smart_templates_update_index();
  const key = fixture.templates.discovery_adapters.derived_headings.get_snapshot().visible_keys[0];
  return { ...fixture, item: fixture.templates.get(key) };
}

test('P4-20/22: configured confirmation preserves same item/key/content and transfers discovery ownership', async (t) => {
  const { templates, item, writes, events } = await prepared(t);
  const key = item.key; const content = item.data.content; const provenance = { ...item.data.provenance };
  const adapter = templates.discovery_adapters.derived_headings;
  t.true(adapter.owns_item(item));
  const result = await run_action_entry(item, 'template_confirm', {});
  t.is(result, item); t.is(templates.get(key), item); t.is(item.data.content, content);
  t.false(item.data.transient); t.is(item.data.provider_key, null);
  t.deepEqual(item.data.provenance, { ...provenance, origin: 'derived_headings' });
  t.false(adapter.owns_item(item));
  t.false(adapter.get_snapshot().visible_keys.includes(key));
  t.false(adapter.get_snapshot().records.some((record) => record.key === key));
  t.true(item._queue_save);
  t.deepEqual(writes, [], 'confirmation queues persistence; it is not a synchronous disk-write receipt');
  t.true(events.some(([name, payload]) => name === 'templates:index_changed' && payload.confirmation_queued));
});

test('P4-25/26: already-confirmed derived items are idempotent; ordinary durable templates are not confirmable', async (t) => {
  const { templates, item } = await prepared(t);
  item.actions.template_confirm();
  const data = item.data;
  t.is(item.actions.template_confirm(), item); t.is(item.data, data);
  const ordinary = templates.create_or_update({ key: 'ordinary', content: '## Own' });
  t.throws(() => ordinary.actions.template_confirm(), { message: /not an inferred candidate/ });
});

test('P4 confirmation: stale references, deleted records, foreign scopes and unloaded catalogs fail before transition', async (t) => {
  const { templates, item } = await prepared(t);
  item.deleted = true;
  t.throws(() => item.actions.template_confirm(), { message: /no longer available/ });
  item.deleted = false;
  delete templates.items[item.key];
  t.throws(() => item.actions.template_confirm(), { message: /no longer available/ });
  templates.set(item);
  const other = create_heading_env(t).templates;
  t.throws(() => other.confirm_template(item), { message: /no longer available/ });
  templates.unload();
  t.throws(() => item.actions.template_confirm(), { message: /no longer available/ });
  t.true(item.data.transient);
});

test('P4 confirmation: queue scheduling failure restores ownership and item data before reporting failure', async (t) => {
  const { templates, item } = await prepared(t);
  const data = item.data; const previous_queue = item._queue_save;
  const queue_save = templates.queue_save;
  templates.queue_save = () => { throw new Error('queue failed'); };
  t.throws(() => item.actions.template_confirm(), { message: 'queue failed' });
  t.is(item.data, data); t.is(item._queue_save, previous_queue);
  t.true(templates.discovery_adapters.derived_headings.owns_item(item));
  t.true(templates.discovery_adapters.derived_headings.get_snapshot().visible_keys.includes(item.key));
  templates.queue_save = queue_save;
});

test('P4-23/24: later empty or same-signature inference neither prunes nor overwrites confirmed content', async (t) => {
  const { templates, blocks, item } = await prepared(t);
  item.actions.template_confirm();
  item.data.content = '## User maintained structure\n';
  const data = item.data;
  await templates.actions.smart_templates_update_index();
  t.is(item.data, data); t.is(item.data.content, '## User maintained structure\n');
  t.deepEqual(templates.discovery_adapters.derived_headings.get_snapshot().visible_keys, []);
  blocks.items = {};
  await templates.actions.smart_templates_update_index();
  t.is(templates.get(item.key), item); t.false(Boolean(item.deleted));
});

test('P4 confirmation race: candidate prepared before confirmation is suppressed when reconciled afterward', async (t) => {
  const { templates, item } = await prepared(t);
  const adapter = templates.discovery_adapters.derived_headings;
  const pending_candidate = await adapter.prepare();
  item.actions.template_confirm();
  const data = item.data;
  templates.reconcile_adapter_candidate(adapter, pending_candidate);
  t.is(item.data, data); t.false(item.data.transient);
  t.deepEqual(adapter.get_snapshot().visible_keys, []);
});

test('P4-18: a durable collision wins, but a different stored derived signature fails rather than overwrites', async (t) => {
  const { templates, blocks } = create_heading_env(t, { documents });
  const result = await blocks.actions.smart_blocks_infer_heading_templates();
  const key = result.templates[0].key;
  const durable = templates.create_or_update({ key, content: '## Existing', transient: false });
  await templates.actions.smart_templates_update_index();
  t.is(durable.data.content, '## Existing');
  t.deepEqual(templates.discovery_adapters.derived_headings.get_snapshot().visible_keys, []);
  durable.data.provenance = { signature: 'different', origin: 'derived_headings' };
  t.is((await templates.actions.smart_templates_update_index()).derived.status, 'last_good');
  t.is(durable.data.content, '## Existing');
});

test('P4-21: real disk confirmation/reload/compaction persists only the confirmed identity', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'templates-p4-'));
  t.teardown(() => fs.rm(root, { recursive: true, force: true }));
  const resolve = (key) => path.join(root, key);
  const data_fs = {
    sep: '/', exists: async (key) => fs.access(resolve(key)).then(() => true, () => false),
    mkdir: async (key) => fs.mkdir(resolve(key), { recursive: true }),
    read: async (key) => fs.readFile(resolve(key), 'utf8'),
    write: async (key, text) => fs.writeFile(resolve(key), text),
    append: async (key, text) => fs.appendFile(resolve(key), text),
    remove: async (key) => fs.unlink(resolve(key)),
  };
  const { templates, item } = await prepared(t, { data_fs });
  await templates.process_save_queue({ force: true });
  t.false(await data_fs.exists(templates.data_adapter.get_item_data_path()));
  const content = item.data.content;
  item.actions.template_confirm();
  await templates.process_save_queue();
  await templates.process_save_queue({ force: true });
  const persisted = await data_fs.read(templates.data_adapter.get_item_data_path());
  t.true(persisted.includes(item.key)); t.false(persisted.includes('"transient":true'));
  t.false(persisted.includes('visible_keys')); t.false(persisted.includes('snapshots'));
  const loaded = create_heading_env(t, { data_fs, settings: { template_base: 'Catalog.base' } });
  await loaded.templates.data_adapter.process_load_queue();
  const saved = loaded.templates.get(item.key);
  t.is(saved.data.content, content); t.false(saved.data.transient); t.is(saved.data.provider_key, null);
  t.true(loaded.templates.get_visible_templates().includes(saved));
  t.is(saved.actions.template_confirm(), saved);
  const compacted = await data_fs.read(templates.data_adapter.get_item_data_path());
  t.is(compacted.split('\n').filter(Boolean).length, 1);
  await loaded.templates.data_adapter.process_load_queue();
  t.is(await data_fs.read(templates.data_adapter.get_item_data_path()), compacted);
});

test('P4 placement: native confirmation menu is conditional and no public Tool/extra command is introduced', async (t) => {
  const { item } = await prepared(t);
  const entry = smart_env_config.actions.template_confirm;
  t.is(entry.action_scope.type, 'item'); t.is(entry.action_scope.collection_key, 'smart_templates');
  t.falsy(entry.tool); t.falsy(entry.commands);
  const when = entry.menus['template:action_menu'].when;
  t.true(when({ scope: item }));
  item.actions.template_confirm();
  t.true(when({ scope: item }), 'pending confirmation exposes the same-action retry');
  t.is(entry.menus['template:action_menu'].title({ scope: item }), 'Retry queued save');
  await item.collection.process_save_queue();
  t.false(when({ scope: item }));
});

test('P4 configured menu: shared resolver invokes exact template scope, then exposes retry only while saving is pending', async (t) => {
  const { resolve_menu_actions } = await import('obsidian-smart-env/src/utils/menu_actions.js');
  const { env, item } = await prepared(t);
  const placements = resolve_menu_actions(env, 'template:action_menu', item);
  const confirm = placements.find((placement) => placement.action_key === 'template_confirm');
  t.truthy(confirm);
  t.is(await confirm.run(), item);
  t.is(resolve_menu_actions(env, 'template:action_menu', item).find((placement) => placement.action_key === 'template_confirm').title, 'Retry queued save');
  await item.collection.process_save_queue();
  t.false(resolve_menu_actions(env, 'template:action_menu', item).some((placement) => placement.action_key === 'template_confirm'));
  t.true(resolve_menu_actions(env, 'template:action_menu', item).some((placement) => placement.action_key === 'template_copy_markdown'));
});

test('P4 candidate consumption: existing read, prompt building and selection work before confirmation', async (t) => {
  const { templates, item, reads, env } = await prepared(t);
  const read_count = reads.length;
  const content = await item.read();
  t.is(content, '## Why\n\n## Next\n');
  const prompt = await item.actions.template_build_prompt({
    ctx: { env, get_text: async () => '<context>Evidence</context>' },
    selected_template_keys: [item.key], user_message: 'Use this structure.',
  });
  t.regex(prompt, /## Why\n\n## Next/); t.regex(prompt, /Evidence/);
  t.true(item.data.transient);
  t.is(reads.length, read_count, 'using an inline candidate starts no corpus reads');
  t.true(templates.get_visible_templates().includes(item));
});


test('STAB-14: a throwing confirmation observer leaves a successful synchronous transfer and protects it from later inference', async (t) => {
  const { templates, item, env } = await prepared(t);
  env.events.on('templates:index_changed', () => { throw new Error('expected confirmation observer failure'); });
  const data = item.data;
  t.is(item.actions.template_confirm(), item);
  t.false(item.data.transient); t.true(item._queue_save);
  t.is(item.data.content, data.content); t.is(templates.get(item.key), item);
  await templates.actions.smart_templates_update_index({ source_keys: [] });
  t.is(templates.get(item.key), item); t.false(Boolean(item.deleted));
});

test('STAB-15: same-action retry only requeues pending persistence; settled confirmation is a no-op', async (t) => {
  const { templates, item } = await prepared(t);
  item.actions.template_confirm();
  const data = item.data; let requeues = 0;
  templates.queue_save = () => { requeues += 1; };
  templates.discovery_adapters.derived_headings.detach_item = () => t.fail('retry detached ownership again');
  t.is(item.actions.template_confirm(), item); t.is(item.data, data); t.is(requeues, 1);
  item._queue_save = false;
  t.is(item.actions.template_confirm(), item); t.is(item.data, data); t.is(requeues, 1);
  item._queue_save = true;
  templates.queue_save = () => { throw new Error('retry scheduling failed'); };
  t.throws(() => item.actions.template_confirm(), { message: 'retry scheduling failed' });
  t.is(item.data, data); t.false(item.data.transient); t.true(item._queue_save);
});

test('STAB-16: inherited append failure leaves pending ownership; explicit retry subsequently persists the same record', async (t) => {
  const { templates, item, env, files } = await prepared(t);
  item.actions.template_confirm(); const data = item.data;
  const append = env.data_fs.append;
  env.data_fs.append = async () => { const error = new Error('expected denied append'); error.code = 'EACCES'; throw error; };
  await templates.process_save_queue();
  t.true(item._queue_save); t.false(item.data.transient); t.is(item.data, data);
  t.false([...files.values()].join('').includes(item.key));
  env.data_fs.append = append;
  let requeues = 0; const queue_save = templates.queue_save.bind(templates);
  templates.queue_save = () => { requeues += 1; queue_save(); };
  t.is(item.actions.template_confirm(), item); t.is(requeues, 1);
  await templates.process_save_queue();
  t.false(item._queue_save); t.is(item.data, data);
  t.true([...files.values()].join('').includes(item.key));
});
