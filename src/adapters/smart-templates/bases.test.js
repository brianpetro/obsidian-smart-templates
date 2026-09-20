import test from 'ava';
import { create_base_env, deferred } from '../../test_support/bases.js';
import { context_suggest_templates } from '../../actions/context-suggest/templates.js';
import { SmartSource } from 'smart-sources/smart_source.js';

const scope = { scope_source_key: 'Projects/A.md' };
const vault_keys = (templates, params = scope) => templates.get_visible_templates(params).filter((item) => item.data.source_key).map((item) => item.key);

test('P3-01/02/03/04: Bases is authoritative, built-ins and durable inline remain global', async (t) => {
  const { templates, env, add_base, add_source } = create_base_env(t, { settings: { template_folder: 'Legacy' } });
  add_source('Included.md'); add_source('Legacy/Outside.md');
  add_base(undefined, undefined, () => [{ 'file.path': 'Included.md' }]);
  const outside = templates.create_or_update({ key: 'Legacy/Outside.md', source_key: 'Legacy/Outside.md' });
  templates.create_or_update({ key: 'saved-inline', source_key: null, content: 'saved', transient: false });
  const adapter = templates.discovery_adapters.bases;
  const candidate = await adapter.prepare(scope);
  t.falsy(templates.get('Included.md'), 'adapter preparation never mutates Templates catalog');
  templates.reconcile_adapter_candidate(adapter, candidate);
  t.deepEqual(vault_keys(templates), ['Included.md']);
  t.false(Boolean(outside.deleted));
  t.is(templates.get_visible_templates(scope).length, 7);
  env.settings.smart_templates.template_base = '';
  await templates.prepare_templates(scope);
  t.deepEqual(vault_keys(templates), ['Legacy/Outside.md']);
  t.true(templates.get('Included.md').deleted, 'successful global legacy scan may prune dormant Base records');
});

test('P3-08/09/10/12/13: per-scope membership shares durable item identity without pruning', async (t) => {
  const { templates, reads, add_source, add_base } = create_base_env(t);
  ['A.md', 'B.md', 'C.md'].forEach((key) => add_source(key));
  let empty_a = false;
  add_base(undefined, undefined, ({ this_file }) => (this_file === 'Projects/A.md' ? (empty_a ? [] : ['A.md', 'B.md']) : ['B.md', 'C.md']).map((path) => ({ path })));
  const other = { scope_source_key: 'Projects/B.md' };
  await Promise.all([templates.prepare_templates(scope), templates.prepare_templates(other)]);
  const shared = templates.get('B.md');
  t.deepEqual(vault_keys(templates), ['A.md', 'B.md']);
  t.deepEqual(vault_keys(templates, other), ['B.md', 'C.md']);
  empty_a = true;
  await templates.refresh_templates(scope);
  t.deepEqual(vault_keys(templates), []);
  t.deepEqual(vault_keys(templates, other), ['B.md', 'C.md']);
  t.is(templates.get('B.md'), shared);
  t.false(Boolean(templates.get('A.md').deleted));
  t.true(reads.every(({ params }) => Object.keys(params).join() === 'this_file'));
  t.false(JSON.stringify(shared.data).includes('Projects/'));
  t.false(JSON.stringify(shared.data).includes('Catalog.base'));
});

test('P3-14/15/16: malformed/failed results preserve exact last-good without legacy widening', async (t) => {
  const { templates, events, add_source, add_base } = create_base_env(t);
  add_source('A.md');
  let response = [{ path: 'A.md' }];
  add_base(undefined, undefined, () => response);
  await templates.prepare_templates(scope);
  response = '{"not":"rows"}';
  t.is((await templates.refresh_templates(scope)).status, 'last_good');
  t.deepEqual(vault_keys(templates), ['A.md']);
  t.is(events.filter(([key]) => key === 'templates:base_warning').length, 1);
  const other = { scope_source_key: 'Other.md' };
  t.is((await templates.prepare_templates(other)).status, 'unavailable');
  t.deepEqual(vault_keys(templates, other), []);
  response = [];
  t.is((await templates.refresh_templates(scope)).status, 'ready');
  t.deepEqual(vault_keys(templates), []);
});

test('P3: no applicable mapping/no source/invalid config never reads or falls back to legacy', async (t) => {
  const { templates, reads, env, add_base } = create_base_env(t, {
    settings: { template_base: '', template_base_scopes: 'Projects | Templates/Catalog.base | Templates' },
  });
  add_base();
  await templates.prepare_templates({ scope_source_key: 'Elsewhere/A.md' });
  t.is(templates.get_visible_templates({ scope_source_key: 'Elsewhere/A.md' }).length, 5);
  await templates.prepare_templates({ scope_source_key: null });
  t.is(reads.length, 0);
  env.settings.smart_templates.template_base = '../invalid.base';
  t.is((await templates.prepare_templates(scope)).status, 'unavailable');
  t.is(templates.active_discovery_adapter.key, 'bases');
  t.is(reads.length, 0);
});

test('P3-17/18/19/20: invalidation is cheap and limited to candidate topology/configured Base changes', async (t) => {
  const { templates, env, reads, imports, add_base } = create_base_env(t);
  add_base();
  await templates.prepare_templates(scope);
  const snapshot = templates.get_discovery_state(scope);
  for (const [reason, path] of [
    ['sources:modified', 'A.md'], ['sources:created', 'Scratch.base'], ['sources:deleted', 'Scratch.base'],
    ['sources:renamed', 'Scratch2.base'], ['sources:imported', 'Templates/Catalog.base'],
  ]) env.events.emit(reason, { path });
  t.is(snapshot.status, 'ready');
  t.is(reads.length, 1); t.is(imports.length, 0);
  env.events.emit('sources:created', { path: 'New.md' });
  t.is(snapshot.status, 'stale');
  t.is(reads.length, 1);
  await templates.prepare_templates(scope);
  t.is(reads.length, 2);
  env.events.emit('sources:modified', { path: 'Templates/Catalog.base' });
  t.is(templates.get_discovery_state(scope).status, 'stale');
  t.is(imports.length, 0);
  await templates.prepare_templates(scope);
  t.is(imports.length, 1);
});

test('P3-21: metadata resolves first declared/explicit views without reconstructing keys', async (t) => {
  const { templates, reads, add_base, env } = create_base_env(t);
  const base = add_base(undefined, ['First', 'Second']);
  base.blocks.reverse();
  await templates.prepare_templates(scope);
  t.is(reads[0].view_name, 'First');
  env.settings.smart_templates.template_base_view = 'Second';
  await templates.prepare_templates(scope);
  t.is(reads[1].view_name, 'Second');
  env.settings.smart_templates.template_base_view = 'Missing';
  const state = await templates.prepare_templates(scope);
  t.is(state.status, 'unavailable');
  t.regex(state.issues[0].message, /view not found/);
  t.is(reads.length, 2);
});

test('P3 lifecycle: missing views import through the source once and shared import errors remain failures', async (t) => {
  const { templates, env, add_base } = create_base_env(t);
  const source = add_base();
  const views = source.blocks;
  source.blocks = [];
  let calls = 0;
  source.import = async () => { calls += 1; source.blocks = views; source.data.last_import = { at: 2 }; };
  await Promise.all([templates.prepare_templates(scope), templates.prepare_templates({ scope_source_key: 'B.md' })]);
  t.is(calls, 1);
  // Exercise the supplied SmartSource wrapper, which catches and requeues.
  source.source_adapter = { import: async () => { throw new Error('expected test import failure'); } };
  source.queue_import = () => { source._queue_import = true; };
  source.emit_event = () => {};
  source.import = SmartSource.prototype.import;
  env.events.emit('sources:modified', { path: source.key });
  const state = await templates.prepare_templates(scope);
  t.is(state.status, 'last_good');
  t.regex(state.issues[0].message, /did not complete/);
});

test('P3 lifecycle: successful definition refresh exposes changed views, not stale view metadata', async (t) => {
  const { templates, env, reads, add_base } = create_base_env(t);
  const source = add_base(undefined, ['Old']);
  await templates.prepare_templates(scope);
  source.import = async () => {
    source.blocks = [{ key: 'opaque-new', data: { view_name: 'New' }, lines: [1, 1], read: async () => '[]' }];
    source.data.last_import = { at: 2 };
  };
  env.events.emit('sources:modified', { path: source.key });
  const state = await templates.prepare_templates(scope);
  t.is(state.view_name, 'New');
  t.is(reads.length, 1, 'old view was not read again');
});

test('P3-22: heading templates stay inside Base member sources', async (t) => {
  const { templates, add_source, add_base } = create_base_env(t, { settings: { template_headings: 'Form' } });
  add_source('A.md', [{ key: 'A.md#Form', lines: [1, 2] }]);
  add_source('Outside.md', [{ key: 'Outside.md#Form', lines: [1, 2] }]);
  add_base(undefined, undefined, () => [{ path: 'A.md' }]);
  await templates.prepare_templates(scope);
  t.deepEqual(vault_keys(templates), ['A.md', 'A.md#Form']);
  t.falsy(templates.get('Outside.md#Form'));
});

test('P3 rows: unusable and excluded paths yield one warning, not fallback sources', async (t) => {
  const { templates, env, events, add_source, add_base } = create_base_env(t);
  add_source('A.md'); add_source('Excluded.md');
  env.smart_sources.fs = { is_excluded: (key) => key === 'Excluded.md' };
  const initialized = [];
  env.smart_sources.init_file_path = (key) => { initialized.push(key); return key === 'New.md' ? add_source(key) : undefined; };
  add_base(undefined, undefined, () => [{ path: 'A.md' }, { path: 'Excluded.md' }, { path: 'New.md' }, { path: 'Missing.md' }, { 'file.name': 'No path' }]);
  await templates.prepare_templates(scope);
  t.deepEqual(vault_keys(templates), ['A.md', 'New.md']);
  t.deepEqual(initialized, ['New.md', 'Missing.md']);
  t.is(events.filter(([key]) => key === 'templates:base_warning').length, 1);
});

test('P3-23/24: topology cleanup is deferred, durable, and prefix-boundary safe', async (t) => {
  const { templates, env, writes, add_source, add_base } = create_base_env(t, { settings: { template_headings: 'Form' } });
  add_source('A.md', [{ key: 'A.md#Form', lines: [1, 2] }]); add_source('AB.md');
  add_base(undefined, undefined, () => [{ path: 'A.md' }, { path: 'AB.md' }]);
  await templates.prepare_templates(scope);
  const item = templates.get('A.md');
  delete env.smart_sources.items['A.md'];
  env.events.emit('sources:deleted', { path: 'A.md' });
  t.false(Boolean(item.deleted)); t.is(writes.length, 0);
  t.deepEqual(vault_keys(templates), ['AB.md']);
  await templates.prepare_templates(scope);
  t.true(item.deleted); t.true(templates.get('A.md#Form').deleted);
  t.false(Boolean(templates.get('AB.md').deleted));
  env.events.emit('sources:renamed', { old_path: 'AB.md', path: 'Renamed.md' });
  delete env.smart_sources.items['AB.md']; add_source('Renamed.md');
  templates.discovery_adapters.bases.get_view_blocks(env.smart_sources.get('Templates/Catalog.base'))[0].read = async () => JSON.stringify([{ path: 'Renamed.md' }]);
  await templates.prepare_templates(scope);
  t.true(templates.get('AB.md').deleted);
  t.deepEqual(vault_keys(templates), ['Renamed.md']);
});

test('P3 concurrency: invalidated old read cannot overwrite a newer read', async (t) => {
  const { templates, env, add_source, add_base } = create_base_env(t);
  add_source('Old.md'); add_source('New.md');
  const first = deferred();
  let count = 0;
  add_base(undefined, undefined, () => ++count === 1 ? first.promise : [{ path: 'New.md' }]);
  const old = templates.prepare_templates(scope);
  await Promise.resolve(); await Promise.resolve();
  env.events.emit('sources:created', { path: 'New.md' });
  await templates.prepare_templates(scope);
  first.resolve([{ path: 'Old.md' }]);
  await old;
  t.deepEqual(vault_keys(templates), ['New.md']);
  t.falsy(templates.get('Old.md'));
});

test('P3 concurrency: coalesced request reads once; config switch/unload revoke pending work', async (t) => {
  const { templates, env, add_source, add_base } = create_base_env(t);
  add_source('Old.md');
  const pending = deferred();
  let reads = 0;
  add_base(undefined, undefined, () => { reads += 1; return pending.promise; });
  const a = templates.prepare_templates(scope); const b = templates.prepare_templates(scope);
  await Promise.resolve(); await Promise.resolve();
  t.is(reads, 1);
  env.settings.smart_templates.template_base = '';
  await templates.prepare_templates(scope);
  pending.resolve([{ path: 'Old.md' }]); await Promise.all([a, b]);
  t.falsy(templates.get('Old.md'));
  env.settings.smart_templates.template_base = 'Templates/Catalog.base';
  const last = deferred(); env.smart_sources.get('Templates/Catalog.base').blocks[0].read = () => last.promise;
  const closing = templates.prepare_templates(scope);
  await Promise.resolve(); await Promise.resolve();
  templates.unload(); last.resolve('[]');
  t.is(await closing, null);
  t.is(templates.discovery_adapters.bases.snapshots.size, 0);
});

test('P3 selectors: synchronous suggestions receive exactly the modal frozen scope', async (t) => {
  const { templates, env, add_source, add_base } = create_base_env(t);
  add_source('A.md'); add_source('B.md');
  add_base(undefined, undefined, ({ this_file }) => [{ path: this_file === scope.scope_source_key ? 'A.md' : 'B.md' }]);
  await templates.prepare_templates(scope);
  await templates.prepare_templates({ scope_source_key: 'B.md' });
  const modal = { params: { ...scope }, setInstructions() {}, get_selected_template_keys: () => [] };
  const rows = context_suggest_templates.call({ env }, { modal });
  t.true(Array.isArray(rows));
  t.true(rows.some((row) => row.key === 'A.md'));
  t.false(rows.some((row) => row.key === 'B.md'));
});


test('P3 epochs: a pending old scope cannot publish after Base configuration changes', async (t) => {
  const { templates, add_base, add_source } = create_base_env(t);
  add_source('Old.md'); add_source('New.md');
  const pending = deferred();
  add_base(undefined, undefined, () => pending.promise);
  add_base('New.base', undefined, () => [{ path: 'New.md' }]);
  const old = templates.prepare_templates(scope);
  await Promise.resolve(); await Promise.resolve();
  templates.set_base_settings({ template_base: 'New.base' });
  await templates.prepare_templates(scope);
  pending.resolve([{ path: 'Old.md' }]); await old;
  t.deepEqual(vault_keys(templates), ['New.md']);
  t.falsy(templates.get('Old.md'));
});

test('P3 capability absence: unsupported Core Base representation is explicit, not legacy fallback', async (t) => {
  const { templates, add_base } = create_base_env(t, { settings: { template_folder: 'Legacy' } });
  const base = add_base();
  base.blocks = [];
  base.import = async () => { base.data.last_import = { at: 2 }; };
  const state = await templates.prepare_templates(scope);
  t.is(state.status, 'unavailable');
  t.regex(state.issues[0].message, /No indexed Base views/);
  t.is(templates.get_visible_templates(scope).length, 5);
});

test('P3 readiness: early index attempts read nothing and retain built-ins', async (t) => {
  const { templates, env, reads, add_base } = create_base_env(t);
  add_base(); env.collections.smart_blocks = 'loading';
  const state = await templates.prepare_templates(scope);
  t.is(state.status, 'unavailable'); t.is(reads.length, 0);
  t.is(templates.get_visible_templates(scope).length, 5);
});


test('STAB-11: folder topology invalidates membership and descendant definitions without importing or querying', async (t) => {
  const { templates, env, reads, imports, add_base } = create_base_env(t, { settings: {
    template_base: 'Templates.v1/Catalog.base', template_base_scopes: 'Projects | Other/Catalog.base | Templates',
  } });
  add_base('Templates.v1/Catalog.base'); add_base('Other/Catalog.base');
  const first_scope = { scope_source_key: 'Notes/A.md' };
  const second_scope = { scope_source_key: 'Projects/A.md' };
  await templates.prepare_templates(first_scope); await templates.prepare_templates(second_scope);
  const adapter = templates.discovery_adapters.bases;
  const first = adapter.get_snapshot(first_scope); const second = adapter.get_snapshot(second_scope);
  const read_count = reads.length;
  env.events.emit('sources:renamed', { collection_key: 'smart_sources', old_path: 'Templates.v1', path: 'Templates.v2',
    item_key: 'Templates.v2', event_source: 'obsidian:vault.rename' });
  t.is(first.status, 'stale'); t.is(second.status, 'stale');
  t.is(adapter.definition_revisions.get('Templates.v1/Catalog.base'), 1);
  t.falsy(adapter.definition_revisions.get('Other/Catalog.base'));
  t.is(reads.length, read_count); t.deepEqual(imports, []);
  const revision = first.invalidation_revision;
  env.events.emit('sources:deleted', { path: 'Templates.v1-extra' });
  t.is(first.invalidation_revision, revision + 1);
  t.is(adapter.definition_revisions.get('Templates.v1/Catalog.base'), 1, 'no substring ancestor match');
});

test('STAB-12: nonconfigured temporary Bases and ordinary note edits remain irrelevant, configured ancestors do not', async (t) => {
  const { templates, env, add_base } = create_base_env(t, { settings: { template_base: 'Folder.base/Catalog.base' } });
  add_base('Folder.base/Catalog.base'); await templates.prepare_templates(scope);
  const adapter = templates.discovery_adapters.bases; const snapshot = adapter.get_snapshot(scope);
  const revision = snapshot.invalidation_revision;
  for (const name of ['sources:created', 'sources:deleted', 'sources:renamed']) {
    env.events.emit(name, { path: 'Temp-new.base', old_path: 'Temp-old.base' });
  }
  env.events.emit('sources:modified', { path: 'Notes/A.md' });
  t.is(snapshot.invalidation_revision, revision); t.is(snapshot.status, 'ready');
  env.events.emit('sources:deleted', { path: 'Folder.base' });
  t.is(snapshot.status, 'stale'); t.is(adapter.definition_revisions.get('Folder.base/Catalog.base'), 1);
});

test('STAB-13: Base warning observers cannot turn a committed usable result into a discovery failure', async (t) => {
  const { templates, env, add_source, add_base } = create_base_env(t);
  add_source('A.md'); add_base(undefined, undefined, () => [{ path: 'A.md' }, { name: 'unusable' }]);
  env.events.on('templates:base_warning', () => { throw new Error('expected warning observer failure'); });
  const state = await templates.prepare_templates(scope);
  t.is(state.status, 'ready'); t.is(state.revision, 1); t.deepEqual(vault_keys(templates), ['A.md']);
  t.regex(state.issues[0].message, /skipped/);
});
