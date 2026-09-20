import test from 'ava';
import { create_env, CandidateFixtureAdapter, fixture_candidate } from '../test_support/templates.js';

function add_fixture_adapter(templates) {
  const adapter = new CandidateFixtureAdapter(templates);
  templates.discovery_adapters[adapter.key] = adapter;
  return adapter;
}

test('P2-04/05/06/07: successful legacy reconciliation prunes exact output set, not broad matcher', async (t) => {
  const { templates, env } = create_env(t, {
    settings: { template_folder: 'Templates', template_headings: 'Form' },
    sources: { 'Templates/A.md': { key: 'Templates/A.md' } },
    blocks: { 'Templates/A.md#Form': { key: 'Templates/A.md#Form' } },
  });
  templates.init();
  const saved = templates.create_or_update({ key: 'saved:inline', content: 'saved', transient: false });
  await templates.prepare_templates();
  t.truthy(templates.get('Templates/A.md#Form'));
  env.settings.smart_templates.template_headings = '';
  await templates.prepare_templates();
  t.true(templates.get('Templates/A.md#Form').deleted);
  t.false(Boolean(templates.get('Templates/A.md').deleted));
  t.is(templates.get('saved:inline'), saved);
  t.false(Boolean(saved.deleted));
  t.true(templates.get_visible_templates().some((item) => item.data.built_in));
});

test('P2: source events are cheap; prepare reconciles removed flags/deletes/rename old paths', async (t) => {
  const sources = { 'A.md': { key: 'A.md', metadata: { 'smart template': true } } };
  const { templates, env, writes } = create_env(t, { sources });
  templates.init();
  await templates.prepare_templates();
  const item = templates.get('A.md');
  sources['A.md'].metadata['smart template'] = false;
  env.events.emit('sources:modified', { path: 'A.md' });
  t.false(Boolean(item.deleted));
  t.deepEqual(writes, []);
  await templates.prepare_templates();
  t.true(item.deleted);
  sources['A.md'].metadata['smart template'] = true;
  env.events.emit('sources:modified', { path: 'A.md' });
  await templates.prepare_templates();
  t.false(item.deleted);
  delete sources['A.md'];
  sources['B.md'] = { key: 'B.md', metadata: { 'smart template': true } };
  env.events.emit('sources:renamed', { old_path: 'A.md', path: 'B.md' });
  await templates.prepare_templates();
  t.true(item.deleted);
  t.truthy(templates.get('B.md'));
});

test('P2-14/15/16: unavailable preparation retains built-ins and later failure preserves last-good', async (t) => {
  const { templates, env } = create_env(t, { settings: { template_folder: 'Templates' }, sources: { 'Templates/A.md': { key: 'Templates/A.md' } } });
  env.collections.smart_sources = 'loading';
  templates.init();
  t.is(templates.get_visible_templates().length, 5);
  t.is((await templates.prepare_templates()).status, 'unavailable');
  env.collections.smart_sources = 'loaded';
  t.is((await templates.prepare_templates()).status, 'ready');
  env.smart_sources.sources_re_import_queue.x = {};
  templates.invalidate_templates();
  t.is((await templates.prepare_templates()).status, 'last_good');
  t.true(templates.get_visible_templates().some((item) => item.key === 'Templates/A.md'));
  t.false(Boolean(templates.get('Templates/A.md').deleted));
});

test('P2-02: full candidate collision preflight leaves earlier records and snapshot unchanged', (t) => {
  const { templates } = create_env(t);
  const adapter = add_fixture_adapter(templates);
  const candidate = fixture_candidate(adapter, ['candidate:A', 'candidate:A']);
  t.throws(() => templates.reconcile_adapter_candidate(adapter, candidate), { message: /duplicate/ });
  t.deepEqual(Object.keys(templates.items), []);
  t.is(adapter.get_snapshot().status, 'unprepared');
});

test('P2: incompatible source identity is rejected before any upsert', (t) => {
  const { templates } = create_env(t);
  const existing = templates.create_or_update({ key: 'A.md', content: 'user-owned' });
  const adapter = templates.discovery_adapters.legacy;
  const candidate = adapter.create_candidate();
  candidate.records = [
    { key: 'B.md', data: { source_key: 'B.md', content: null } },
    { key: 'A.md', data: { source_key: 'A.md', content: null } },
  ];
  candidate.visible_keys = ['B.md', 'A.md'];
  t.throws(() => templates.reconcile_adapter_candidate(adapter, candidate), { message: /collision/ });
  t.falsy(templates.get('B.md'));
  t.is(existing.data.content, 'user-owned');
});

test('P2: generic authoritative transient reconciliation prunes memory without tombstones', async (t) => {
  const { templates, writes } = create_env(t);
  const adapter = add_fixture_adapter(templates);
  templates.reconcile_adapter_candidate(adapter, fixture_candidate(adapter, ['candidate:A', 'candidate:B']));
  const b = templates.get('candidate:B');
  adapter.invalidate();
  templates.reconcile_adapter_candidate(adapter, fixture_candidate(adapter, ['candidate:B', 'candidate:C']));
  t.falsy(templates.get('candidate:A'));
  t.is(templates.get('candidate:B'), b);
  await templates.process_save_queue({ force: true });
  t.deepEqual(writes, []);
});

test('P2: a durable inline record cannot be overwritten or owned by transient discovery', (t) => {
  const { templates } = create_env(t);
  const adapter = add_fixture_adapter(templates);
  const saved = templates.create_or_update({ key: 'candidate:A', content: 'user-owned', transient: false });
  templates.reconcile_adapter_candidate(adapter, fixture_candidate(adapter, ['candidate:A']));
  t.is(templates.get('candidate:A'), saved);
  t.is(saved.data.content, 'user-owned');
  t.deepEqual(adapter.get_snapshot().visible_keys, []);
  adapter.invalidate();
  templates.reconcile_adapter_candidate(adapter, fixture_candidate(adapter, []));
  t.false(Boolean(saved.deleted));
});

test('P2: ensure-only adapters cannot prune another catalog identity', (t) => {
  const { templates } = create_env(t);
  const adapter = add_fixture_adapter(templates);
  Object.defineProperty(adapter, 'reconcile_mode', { value: 'ensure' });
  const item = templates.create_or_update({ key: 'A.md', source_key: 'A.md' });
  templates.reconcile_adapter_candidate(adapter, fixture_candidate(adapter));
  t.false(Boolean(item.deleted));
});

test('P2: stale candidate and foreign owner are rejected without catalog mutation', (t) => {
  const { templates } = create_env(t);
  const adapter = add_fixture_adapter(templates);
  const candidate = fixture_candidate(adapter, ['candidate:A']);
  adapter.invalidate();
  t.throws(() => templates.reconcile_adapter_candidate(adapter, candidate), { message: /stale/ });
  t.deepEqual(Object.keys(templates.items), []);
  const other = new CandidateFixtureAdapter(templates);
  t.throws(() => templates.reconcile_adapter_candidate(other, fixture_candidate(other)), { message: /stale/ });
});

test('P2: prepare coalesces in-flight work and cannot commit after a newer invalidation', async (t) => {
  const { templates } = create_env(t);
  const adapter = templates.discovery_adapters.legacy;
  let resolve;
  let calls = 0;
  adapter.prepare = async () => {
    calls += 1;
    const candidate = adapter.create_candidate();
    await new Promise((done) => { resolve = done; });
    return candidate;
  };
  const first = templates.prepare_templates();
  const second = templates.prepare_templates();
  templates.invalidate_templates();
  resolve();
  await Promise.all([first, second]);
  t.is(calls, 1);
  t.is(adapter.get_snapshot().revision, 0);
  t.is(adapter.get_snapshot().status, 'unprepared');
});

test('P2: unload removes listeners/timers and a late preparation cannot repopulate catalog', async (t) => {
  const { templates, listeners } = create_env(t);
  templates.init();
  const adapter = templates.discovery_adapters.legacy;
  let resolve;
  adapter.prepare = async () => {
    const candidate = adapter.create_candidate();
    await new Promise((done) => { resolve = done; });
    return candidate;
  };
  const pending = templates.prepare_templates();
  templates.unload();
  resolve();
  await pending;
  t.deepEqual(Object.keys(templates.items), []);
  t.true([...listeners.values()].every((callbacks) => callbacks.size === 0));
});

test('P2: rejected commit rolls back data, nested provenance, membership and pending save flags', (t) => {
  const { templates } = create_env(t);
  const adapter = add_fixture_adapter(templates);
  templates.reconcile_adapter_candidate(adapter, fixture_candidate(adapter, ['candidate:A']));
  clearTimeout(templates._debounce_queue_save);
  const item = templates.get('candidate:A');
  const old_data = item.data;
  item._queue_save = false;
  adapter.invalidate();
  const candidate = fixture_candidate(adapter, ['candidate:A', 'candidate:B']);
  candidate.records[0].data.provenance.support = 12;
  adapter.commit = () => { throw new Error('commit rejected'); };
  t.throws(() => templates.reconcile_adapter_candidate(adapter, candidate), { message: 'commit rejected' });
  t.is(item.data, old_data);
  t.falsy(item.data.provenance.support);
  t.falsy(templates.get('candidate:B'));
  t.false(item._queue_save);
});

test('P2: unchanged reconciliation preserves object/data identity and an existing pending save', async (t) => {
  const { templates } = create_env(t, { settings: { template_folder: 'Templates' }, sources: { 'Templates/A.md': { key: 'Templates/A.md' } } });
  await templates.prepare_templates();
  const item = templates.get('Templates/A.md');
  const data = item.data;
  item.queue_save();
  await templates.refresh_templates();
  t.is(templates.get(item.key), item);
  t.is(item.data, data);
  t.true(item._queue_save);
});

test('P2: invalid visible identity and foreign transient owner fail before a catalog change', (t) => {
  const { templates } = create_env(t);
  const adapter = add_fixture_adapter(templates);
  const candidate = fixture_candidate(adapter, ['candidate:A']);
  candidate.visible_keys.push('missing');
  t.throws(() => templates.reconcile_adapter_candidate(adapter, candidate), { message: /no catalog record/ });
  const foreign = fixture_candidate(adapter, ['candidate:A']);
  foreign.records[0].data.provider_key = 'someone_else';
  t.throws(() => templates.reconcile_adapter_candidate(adapter, foreign), { message: /owner/ });
  t.deepEqual(Object.keys(templates.items), []);
});

test('P2-03: repeated source events neither enumerate source/block maps nor prepare discovery', (t) => {
  const { templates, env, writes } = create_env(t);
  templates.init();
  env.smart_sources.items = new Proxy({}, { ownKeys() { t.fail('event scanned sources'); } });
  env.smart_blocks.items = new Proxy({}, { ownKeys() { t.fail('event scanned blocks'); } });
  templates.discovery_adapters.legacy.prepare = () => t.fail('event prepared discovery');
  for (let i = 0; i < 100; i += 1) env.events.emit('sources:modified', { path: 'A.md' });
  t.deepEqual(writes, []);
});


test('STAB-05: throwing post-commit observers cannot downgrade published discovery or settings', async (t) => {
  const { templates, env, events } = create_env(t, { settings: { template_folder: 'Templates' },
    sources: { 'Templates/A.md': { key: 'Templates/A.md' } } });
  env.events.on('templates:index_changed', () => { throw new Error('expected observer failure'); });
  let failures = 0;
  const adapter = templates.discovery_adapters.legacy;
  const fail = adapter.fail.bind(adapter);
  adapter.fail = (...args) => { failures += 1; return fail(...args); };
  const state = await templates.prepare_templates();
  t.is(state.status, 'ready'); t.is(state.revision, 1); t.is(failures, 0);
  t.truthy(templates.get('Templates/A.md')); t.true(templates.get('Templates/A.md')._queue_save);
  t.notThrows(() => templates.set_base_settings({ template_base: 'Catalog.base' }));
  t.is(templates.settings.template_base, 'Catalog.base');
  t.true(events.some(([name]) => name === 'templates:index_changed'));
});

test('STAB-06: scheduling failure after commit remains a separate persistence issue, with dirty records retained', async (t) => {
  const { templates, env, events } = create_env(t, { settings: { template_folder: 'Templates' },
    sources: { 'Templates/A.md': { key: 'Templates/A.md' } } });
  templates.queue_save = () => { throw new Error('expected scheduler failure'); };
  env.events.on('templates:persistence_warning', () => { throw new Error('expected warning observer failure'); });
  const state = await templates.prepare_templates();
  t.is(state.status, 'ready'); t.is(state.revision, 1);
  t.true(templates.get('Templates/A.md')._queue_save);
  t.deepEqual(state.issues, []);
  t.true(events.some(([key]) => key === 'templates:persistence_warning'));
});

test('STAB-07: real discovery failures retain their original issue even when failure observers throw', async (t) => {
  const { templates, env } = create_env(t);
  const adapter = templates.discovery_adapters.legacy;
  adapter.prepare = async () => { throw new Error('actual discovery failure'); };
  env.events.on('templates:index_changed', () => { throw new Error('unrelated observer failure'); });
  const state = await templates.prepare_templates();
  t.is(state.status, 'unavailable'); t.is(state.revision, 0);
  t.regex(state.issues[0].message, /actual discovery failure/);
});

test('STAB-08: stale removal intent cannot mask or tombstone a recreated source or its block references', async (t) => {
  const source_key = 'Templates/A.md';
  const sources = { [source_key]: { key: source_key } };
  const blocks = { [source_key + '#Form']: { key: source_key + '#Form' } };
  const { templates, writes } = create_env(t, { sources, blocks, settings: { template_folder: 'Templates', template_headings: 'Form' } });
  await templates.prepare_templates();
  const item = templates.get(source_key); const block = templates.get(source_key + '#Form');
  delete sources[source_key];
  templates.handle_source_event({ reason: 'sources:deleted', path: source_key });
  t.false(templates.get_visible_templates().includes(block));
  sources[source_key] = { key: source_key };
  t.true(templates.get_visible_templates().includes(item));
  t.true(templates.get_visible_templates().includes(block));
  templates.reconcile_removed_sources();
  t.false(Boolean(item.deleted)); t.false(Boolean(block.deleted));
  t.is(templates._removed_source_paths.size, 0); t.deepEqual(writes, []);
});

test('STAB-09: folder cleanup revalidates each descendant and respects path boundaries and confirmed inline items', async (t) => {
  const sources = { 'Templates/A.md': { key: 'Templates/A.md' }, 'Templates/B.md': { key: 'Templates/B.md' },
    'Templates-extra/C.md': { key: 'Templates-extra/C.md' } };
  const { templates } = create_env(t, { sources, settings: { template_name: '.md' } });
  // All three references are valid known catalog identities; membership is not the cleanup oracle.
  for (const key of Object.keys(sources)) templates.create_or_update({ key, source_key: key });
  const inline = templates.create_or_update({ key: 'Templates/kept', source_key: null, content: '## User', transient: false });
  delete sources['Templates/A.md'];
  templates.handle_source_event({ reason: 'sources:renamed', old_path: 'Templates', path: 'Moved' });
  sources['Templates/B.md'] = { key: 'Templates/B.md' };
  templates.reconcile_removed_sources();
  t.true(templates.get('Templates/A.md').deleted);
  t.false(Boolean(templates.get('Templates/B.md').deleted));
  t.false(Boolean(templates.get('Templates-extra/C.md').deleted));
  t.false(Boolean(inline.deleted));
});

test('STAB-10: native current file identity catches folder descendants still present in a stale source index', (t) => {
  const key = 'Folder/A.md'; const live_files = new Set();
  const { templates, env } = create_env(t, { sources: { [key]: { key } } });
  env.plugin.app.vault = { getAbstractFileByPath: (path) => live_files.has(path) ? { path } : null };
  const item = templates.create_or_update({ key, source_key: key });
  templates.handle_source_event({ reason: 'sources:deleted', path: 'Folder' });
  templates.reconcile_removed_sources();
  t.true(item.deleted);
  // Recreated native file exists before the source index catches up: no stale tombstone.
  item.deleted = false; delete env.smart_sources.items[key]; live_files.add(key);
  templates.handle_source_event({ reason: 'sources:deleted', path: 'Folder' });
  templates.reconcile_removed_sources();
  t.false(item.deleted);
});
