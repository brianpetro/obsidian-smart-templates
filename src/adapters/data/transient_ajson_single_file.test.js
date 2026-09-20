import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AjsonSingleFileCollectionDataAdapter } from 'smart-collections/adapters/ajson_single_file.js';
import { AjsonMultiFileItemDataAdapter } from 'smart-collections/adapters/ajson_multi_file.js';
import { TransientAjsonSingleFileCollectionDataAdapter, TransientAjsonItemDataAdapter } from './transient_ajson_single_file.js';
import { create_env } from '../../test_support/templates.js';

function add_items(templates) {
  const durable = templates.create_or_update({ key: 'durable', content: '## Saved' });
  const candidate = templates.create_or_update({ key: 'candidate:A', content: '## Candidate', transient: true, provider_key: 'candidate_fixture' });
  return { durable, candidate };
}

test('P2-08: subclass preserves parent factory and durable serialization byte-for-byte', async (t) => {
  const { templates, files } = create_env(t);
  const { durable } = add_items(templates);
  const actual = templates.data_adapter;
  const parent = new AjsonSingleFileCollectionDataAdapter(templates);
  t.true(actual instanceof TransientAjsonSingleFileCollectionDataAdapter);
  t.true(actual.create_item_adapter(durable) instanceof TransientAjsonItemDataAdapter);
  t.true(actual.create_item_adapter(durable) instanceof AjsonMultiFileItemDataAdapter);
  t.is(actual.get_item_data_path(durable.key), parent.get_item_data_path(durable.key));
  const expected = parent.get_item_ajson(durable);
  await actual.save_item(durable.key);
  t.is(files.get(actual.get_item_data_path()), '\n' + expected);
});

test('P2-09/10/12: real Collection ordinary and force-save batches persist only durable records', async (t) => {
  const { templates, files, writes } = create_env(t);
  const { candidate } = add_items(templates);
  await templates.process_save_queue();
  t.is(writes.length, 1);
  t.false(candidate._queue_save);
  await templates.process_save_queue({ force: true });
  t.is(writes.length, 2);
  const text = files.get(templates.data_adapter.get_item_data_path());
  t.false(text.includes('candidate:A'));
  t.true(text.includes('smart_templates:durable'));
});

test('P2-11: deleted transient records write no tombstone through factory or batch paths', async (t) => {
  const { templates, writes } = create_env(t);
  const candidate = templates.create_or_update({ key: 'candidate:A', content: '## Candidate', transient: true });
  candidate.delete();
  await templates.data_adapter.save_item(candidate.key);
  candidate._queue_save = true;
  await templates.data_adapter.create_item_adapter(candidate).save();
  candidate._queue_save = true;
  await templates.process_save_queue({ force: true });
  t.deepEqual(writes, []);
  t.falsy(templates.get(candidate.key));
});

test('P2-08/13: actual disk save, durable deletion, reload and compaction use inherited implementation', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'templates-p2-'));
  t.teardown(() => fs.rm(root, { recursive: true, force: true }));
  const resolve = (name) => path.join(root, name);
  const data_fs = {
    sep: '/',
    exists: async (name) => fs.access(resolve(name)).then(() => true, () => false),
    mkdir: async (name) => fs.mkdir(resolve(name), { recursive: true }),
    append: async (name, text) => fs.appendFile(resolve(name), text),
    write: async (name, text) => fs.writeFile(resolve(name), text),
    read: async (name) => fs.readFile(resolve(name), 'utf8'),
    remove: async (name) => fs.unlink(resolve(name)),
  };
  const { templates } = create_env(t, { data_fs });
  const { durable, candidate } = add_items(templates);
  await templates.process_save_queue({ force: true });
  durable.data.content = '## Revised';
  durable.queue_save();
  await templates.process_save_queue();
  const removed = templates.create_or_update({ key: 'removed', content: 'remove' });
  await templates.process_save_queue();
  removed.delete();
  candidate.delete();
  await templates.process_save_queue();
  const file_path = templates.data_adapter.get_item_data_path();
  const before = await data_fs.read(file_path);
  t.true(before.includes('"smart_templates:removed": null,'));
  t.false(before.includes('candidate:A'));

  const loaded = create_env(t, { data_fs }).templates;
  await loaded.data_adapter.process_load_queue();
  t.is(loaded.get('durable').data.content, '## Revised');
  t.falsy(loaded.get('removed'));
  t.falsy(loaded.get('candidate:A'));
  const compacted = await data_fs.read(file_path);
  t.is(compacted.split('\n').filter(Boolean).length, 1);
  t.false(compacted.includes(': null'));
  await loaded.data_adapter.process_load_queue();
  t.is(await data_fs.read(file_path), compacted);
});

test('P2: item previously transient can use inherited persistence when data becomes durable', async (t) => {
  const { templates, files } = create_env(t);
  const { candidate, durable } = add_items(templates);
  durable._queue_save = false;
  await templates.process_save_queue();
  t.is(files.size, 0);
  // Storage transition fixture only: no template_confirm action is implemented in P2.
  candidate.data.transient = false;
  candidate.data.provider_key = null;
  candidate.queue_save();
  await templates.process_save_queue();
  const text = files.get(templates.data_adapter.get_item_data_path());
  t.true(text.includes('candidate:A'));
  const loaded = create_env(t).templates;
  loaded.data_adapter.parse_single_file_ajson(text);
  t.is(loaded.get('candidate:A').data.transient, false);
});
