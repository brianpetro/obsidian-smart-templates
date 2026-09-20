import test from 'ava';
import { create_heading_env } from '../../test_support/heading_inference.js';

const documents = { 'A.md': '## Why\n\n## Next\n', 'B.md': '## Why\n\n## Next\n' };
const refresh = (templates, params = {}) => templates.actions.smart_templates_update_index(params);

// A sticky-option regression must fail this test, not leave the following tests
// cancelled behind an unresolved intentionally delayed custom invocation.
async function require_completion(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Default refresh waited on an obsolete custom corpus.')), 2000);
    })]);
  } finally { clearTimeout(timer); }
}

test('P4-11: adapter prepare returns records/counts/provenance without mutating catalog or committed state', async (t) => {
  const { templates, reads, writes } = create_heading_env(t, { documents });
  const adapter = templates.discovery_adapters.derived_headings;
  const candidate = await adapter.prepare({ include_source_keys: true });
  t.deepEqual(Object.keys(templates.items), []);
  t.is(adapter.get_snapshot().revision, 0);
  t.is(candidate.records[0].data.provider_key, 'derived_headings');
  t.is(candidate.records[0].data.adapter_key, 'inline');
  t.true(candidate.records[0].data.transient);
  t.deepEqual(candidate.records[0].data.provenance.source_keys, ['A.md', 'B.md']);
  t.deepEqual(reads, ['A.md', 'B.md']); t.deepEqual(writes, []);
  templates.reconcile_adapter_candidate(adapter, candidate);
  t.is(templates.get(candidate.visible_keys[0]).data.provenance.support, 2);
});

test('P4-14/16: init, ordinary preparation, compatibility refresh and visibility never derive', async (t) => {
  const { templates, env, reads } = create_heading_env(t, { documents });
  templates.init();
  await templates.prepare_templates();
  await templates.refresh_templates();
  templates.get_visible_templates();
  env.events.emit('sources:imported', { item_key: 'A.md', collection_key: 'smart_sources' });
  env.events.emit('sources:modified', { path: 'A.md' });
  await templates.prepare_templates();
  t.deepEqual(reads, []);
  t.is(templates.discovery_adapters.derived_headings.get_snapshot().revision, 0);
});

test('P4-17/19: explicit no-Base index refresh derives once and reuses same transient object', async (t) => {
  const { templates, reads } = create_heading_env(t, { documents });
  const state = await refresh(templates);
  const key = state.derived.visible_keys[0];
  const item = templates.get(key);
  t.deepEqual(reads, ['A.md', 'B.md']);
  t.true(item.data.transient);
  t.true(templates.get_visible_templates().includes(item));
  await refresh(templates);
  t.is(templates.get(key), item);
  t.is(reads.length, 4);
});

test('P4-12/13: successful empty inference prunes only transient candidates, without a tombstone', async (t) => {
  const { templates, blocks, writes, files } = create_heading_env(t, { documents });
  await refresh(templates);
  const candidate = templates.get_visible_templates().find((item) => item.data.transient);
  templates.create_or_update({ key: 'saved', content: '## User' });
  templates.load_default_templates();
  blocks.items = {};
  const state = await refresh(templates);
  t.is(state.derived.status, 'ready'); t.deepEqual(state.derived.visible_keys, []);
  t.falsy(templates.get(candidate.key));
  t.truthy(templates.get('saved'));
  await templates.process_save_queue({ force: true });
  t.false([...files.values()].join('').includes(candidate.key));
  t.true(writes.length > 0);
});

test('P4-14: configured inference failure preserves last-good records; invalid result cannot prune them', async (t) => {
  const { templates, blocks, env } = create_heading_env(t, { documents });
  await refresh(templates);
  const adapter = templates.discovery_adapters.derived_headings;
  const key = adapter.get_snapshot().visible_keys[0];
  const item = templates.get(key);
  const entry = env.config.actions.smart_blocks_infer_heading_templates;
  env.config.actions = { ...env.config.actions, smart_blocks_infer_heading_templates: { ...entry, action() { throw new Error('inference failed'); } } };
  blocks.refresh_actions();
  t.is((await refresh(templates)).derived.status, 'last_good');
  t.is(templates.get(key), item); t.true(templates.get_visible_templates().includes(item));
  env.config.actions.smart_blocks_infer_heading_templates.action = () => ({ templates: [] });
  blocks.refresh_actions();
  t.is((await refresh(templates)).derived.status, 'last_good');
  t.is(templates.get(key), item);
});

test('P4: unavailable dependencies and queued imports fail before corpus reads, without starting imports', async (t) => {
  const { templates, env, reads } = create_heading_env(t, { documents });
  env.collections.smart_blocks = 'loading';
  t.is((await refresh(templates)).derived.status, 'unavailable');
  env.collections.smart_blocks = 'loaded';
  env.smart_sources.sources_re_import_queue['A.md'] = true;
  t.is((await refresh(templates)).derived.status, 'unavailable');
  t.deepEqual(reads, []);
});

test('P4-15: invalidate is cheap, ignores temporary Base events, and notices dotted-folder renames', (t) => {
  const { templates, env } = create_heading_env(t, { documents });
  const adapter = templates.discovery_adapters.derived_headings;
  adapter.get_snapshot();
  env.smart_sources.items = new Proxy({}, { ownKeys() { t.fail('invalidation scanned sources'); } });
  env.smart_blocks.items = new Proxy({}, { ownKeys() { t.fail('invalidation scanned blocks'); } });
  adapter.prepare = () => t.fail('invalidation started inference');
  const revision = adapter.get_snapshot().invalidation_revision;
  adapter.invalidate({ reason: 'sources:created', path: 'temporary.base' });
  adapter.invalidate({ reason: 'sources:deleted', path: 'temporary.base' });
  t.is(adapter.get_snapshot().invalidation_revision, revision);
  adapter.invalidate({ reason: 'sources:modified', path: 'A.md' });
  adapter.invalidate({ reason: 'sources:renamed', old_path: 'Project.v1', path: 'Project.v2' });
  t.is(adapter.get_snapshot().invalidation_revision, revision + 2);
});

test('P4 concurrency: same pending derived request coalesces; later invalidation prevents its commit', async (t) => {
  const { templates, blocks } = create_heading_env(t, { documents });
  const actual = blocks.actions.smart_blocks_infer_heading_templates;
  let done, calls = 0;
  blocks._actions = undefined;
  // Supply a normal instance action surface for a deliberately delayed result.
  Object.defineProperty(blocks, 'actions', { value: { smart_blocks_infer_heading_templates: async (params) => {
    calls += 1; const result = await actual(params); await new Promise((resolve) => { done = resolve; }); return result;
  } } });
  const adapter = templates.discovery_adapters.derived_headings;
  const first = templates.prepare_adapter(adapter);
  const second = templates.prepare_adapter(adapter);
  while (!done) await new Promise((resolve) => setImmediate(resolve));
  adapter.invalidate({ reason: 'sources:modified', path: 'A.md' });
  done(); await Promise.all([first, second]);
  t.is(calls, 1); t.is(adapter.get_snapshot().revision, 0);
  t.deepEqual(Object.keys(templates.items), []);
});

test('P4 concurrency: late old-corpus completion cannot reset a newer whitelist or snapshot', async (t) => {
  const { templates, blocks } = create_heading_env(t, { documents });
  const actual = blocks.actions.smart_blocks_infer_heading_templates;
  let done;
  Object.defineProperty(blocks, 'actions', { value: { smart_blocks_infer_heading_templates: async (params) => {
    const result = await actual(params);
    if (params.source_keys[0] === 'A.md') await new Promise((resolve) => { done = resolve; });
    return result;
  } } });
  const adapter = templates.discovery_adapters.derived_headings;
  const old = templates.prepare_adapter(adapter, { source_keys: ['A.md'], min_support: 1 });
  while (!done) await new Promise((resolve) => setImmediate(resolve));
  await templates.prepare_adapter(adapter, { source_keys: ['B.md'], min_support: 1 });
  const latest = adapter.get_snapshot();
  done(); await old;
  t.is(adapter.get_snapshot(), latest);
  t.deepEqual(adapter.inference_params.source_keys, ['B.md']);
});

test('P4 concurrency: unload or a Base policy change cannot accept a pending derived catalog commit', async (t) => {
  for (const change of ['unload', 'base']) {
    const { templates, blocks } = create_heading_env(t, { documents });
    const actual = blocks.actions.smart_blocks_infer_heading_templates;
    let done;
    Object.defineProperty(blocks, 'actions', { value: { smart_blocks_infer_heading_templates: async (params) => {
      const result = await actual(params); await new Promise((resolve) => { done = resolve; }); return result;
    } } });
    const pending = templates.prepare_adapter(templates.discovery_adapters.derived_headings);
    while (!done) await new Promise((resolve) => setImmediate(resolve));
    if (change === 'unload') templates.unload();
    else templates.set_base_settings({ template_base: 'Catalog.base' });
    done(); await pending;
    t.false(Object.values(templates.items).some((item) => item.data.transient));
  }
});

test('P4: derive under Base mode is suppressed; saved inline templates are still global', async (t) => {
  const { templates, reads } = create_heading_env(t, { documents });
  await refresh(templates);
  const item = templates.get_visible_templates().find((entry) => entry.data.transient);
  templates.set_base_settings({ template_base: 'Catalog.base' });
  t.false(templates.get_visible_templates().includes(item));
  const read_count = reads.length;
  await refresh(templates);
  t.is(reads.length, read_count);
  item.actions.template_confirm();
  t.true(templates.get_visible_templates().includes(item));
});

test('P4 configured action: adapter invokes a replacement strategy once with exact SmartBlocks scope/options', async (t) => {
  let calls = 0;
  const { templates, blocks } = create_heading_env(t, { actions: {
    smart_blocks_infer_heading_templates: { action(params) {
      calls += 1; t.is(this, blocks); t.deepEqual(params.source_keys, []);
      return { templates: [], issues: [], inspected_source_count: 0, eligible_source_count: 0 };
    } },
  } });
  await refresh(templates, { source_keys: [] });
  t.is(calls, 1);
});

test('P4 collision: invalid/duplicate strategy records fail before catalog mutation and preserve last-good', async (t) => {
  const { templates, blocks, env } = create_heading_env(t, { documents });
  const result = await blocks.actions.smart_blocks_infer_heading_templates();
  await refresh(templates);
  const item = templates.get(result.templates[0].key);
  env.config.actions = { ...env.config.actions, smart_blocks_infer_heading_templates: {
    ...env.config.actions.smart_blocks_infer_heading_templates,
    action: () => ({ ...result, templates: [...result.templates, result.templates[0]] }),
  } };
  blocks.refresh_actions();
  t.is((await refresh(templates)).derived.status, 'last_good');
  t.is(templates.get(item.key), item);
});

test('P4 adapter capability: direct collection preparation cannot run inactive derived discovery under Base policy', async (t) => {
  const { templates, reads } = create_heading_env(t, { documents, settings: { template_base: 'Catalog.base' } });
  const adapter = templates.discovery_adapters.derived_headings;
  await templates.prepare_adapter(adapter, { source_keys: ['A.md'] });
  t.deepEqual(reads, []);
  t.is(adapter.get_snapshot().revision, 0);
});


test('STAB-01: configure restores every omitted inference default and returns isolated invocation options', (t) => {
  const { templates } = create_heading_env(t);
  const adapter = templates.discovery_adapters.derived_headings;
  const defaults = JSON.parse(JSON.stringify(adapter.inference_params));
  const keys = ['A.md'];
  const options = adapter.configure({ source_keys: keys, min_support: 7, min_heading_count: 4,
    max_templates: 1, min_heading_confidence: 1, exclude_document_title: false,
    base_heading_level: 1, include_source_keys: true });
  keys.push('B.md'); options.source_keys.push('C.md');
  t.deepEqual(adapter.inference_params.source_keys, ['A.md']);
  const revision = adapter.get_snapshot().invalidation_revision;
  adapter.get_snapshot({ source_keys: [] });
  t.deepEqual(adapter.inference_params.source_keys, ['A.md'], 'snapshot access is not an invocation');
  adapter.configure({});
  t.deepEqual(adapter.inference_params, defaults);
  t.is(adapter.get_snapshot().invalidation_revision, revision + 1);
  adapter.configure({});
  t.is(adapter.get_snapshot().invalidation_revision, revision + 1, 'identical normalized options coalesce');
});

test('STAB-02: empty/custom corpus followed by ordinary Update index restores the complete default corpus', async (t) => {
  const { templates, reads } = create_heading_env(t, { documents });
  let state = await refresh(templates, { source_keys: [], min_support: 7, max_templates: 1, include_source_keys: true });
  t.is(state.derived.inspected_source_count, 0); t.deepEqual(reads, []);
  state = await refresh(templates);
  t.is(state.derived.inspected_source_count, 2); t.is(state.derived.visible_keys.length, 1);
  const item = templates.get(state.derived.visible_keys[0]);
  t.is(item.data.provenance.support, 2); t.falsy(item.data.provenance.source_keys);
  t.deepEqual(reads, ['A.md', 'B.md']);
});

test('STAB-03: refresh captures options before primary discovery and an old refresh cannot restore a prior corpus', async (t) => {
  const { templates } = create_heading_env(t, { documents });
  const legacy = templates.discovery_adapters.legacy;
  const prepare = legacy.prepare.bind(legacy);
  let release, calls = 0;
  legacy.prepare = async (params) => {
    const result = await prepare(params);
    if (++calls === 1) await new Promise((resolve) => { release = resolve; });
    return result;
  };
  const params = { source_keys: ['A.md'], min_support: 1, derive: true };
  const old = templates.refresh_templates(params);
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  params.source_keys.push('B.md'); params.min_support = 20;
  await templates.refresh_templates({ source_keys: ['B.md'], min_support: 1, derive: true });
  const latest = templates.discovery_adapters.derived_headings.get_snapshot();
  release(); await old;
  t.is(templates.discovery_adapters.derived_headings.get_snapshot(), latest);
  t.is(latest.inspected_source_count, 1);
  t.deepEqual(templates.discovery_adapters.derived_headings.inference_params.source_keys, ['B.md']);
});

test('STAB-04: default Update index invalidates an in-flight custom corpus without accepting its late result', async (t) => {
  const { templates, blocks } = create_heading_env(t, { documents });
  const actual = blocks.actions.smart_blocks_infer_heading_templates;
  const releases = [];
  Object.defineProperty(blocks, 'actions', { value: { smart_blocks_infer_heading_templates: async (params) => {
    const result = await actual(params);
    if (params.source_keys) await new Promise((resolve) => { releases.push(resolve); });
    return result;
  } } });
  const adapter = templates.discovery_adapters.derived_headings;
  const old = templates.prepare_adapter(adapter, { source_keys: ['A.md'], min_support: 1 });
  while (!releases.length) await new Promise((resolve) => setImmediate(resolve));
  const current = refresh(templates);
  let latest;
  try {
    await require_completion(current);
    latest = adapter.get_snapshot();
  } finally {
    releases.forEach((release) => release());
    await Promise.allSettled([old, current]);
  }
  t.is(adapter.get_snapshot(), latest); t.is(latest.inspected_source_count, 2);
  t.falsy(adapter.inference_params.source_keys); t.is(adapter.inference_params.min_support, 2);
});

test('STAB-24: a delayed primary discovery cannot observe later mutations of the explicit inference request', async (t) => {
  const { templates, reads } = create_heading_env(t, { documents });
  const legacy = templates.discovery_adapters.legacy;
  const prepare = legacy.prepare.bind(legacy); let release;
  legacy.prepare = async (params) => {
    const candidate = await prepare(params);
    await new Promise((resolve) => { release = resolve; }); return candidate;
  };
  const options = { derive: true, source_keys: ['A.md'], min_support: 1, include_source_keys: true };
  const pending = templates.refresh_templates(options);
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  options.source_keys.splice(0, 1, 'B.md'); options.min_support = 20;
  release(); const state = await pending;
  t.deepEqual(reads, ['A.md']); t.is(state.derived.visible_keys.length, 1);
  t.deepEqual(templates.get(state.derived.visible_keys[0]).data.provenance.source_keys, ['A.md']);
});

test('STAB-25: a late failed custom invocation cannot downgrade the newer default snapshot', async (t) => {
  const { templates, blocks } = create_heading_env(t, { documents });
  const actual = blocks.actions.smart_blocks_infer_heading_templates; const releases = [];
  Object.defineProperty(blocks, 'actions', { value: { smart_blocks_infer_heading_templates: async (params) => {
    if (params.source_keys) {
      await new Promise((resolve) => { releases.push(resolve); }); throw new Error('obsolete custom inference failure');
    }
    return await actual(params);
  } } });
  const adapter = templates.discovery_adapters.derived_headings;
  const old = templates.prepare_adapter(adapter, { source_keys: [], min_support: 7 });
  while (!releases.length) await new Promise((resolve) => setImmediate(resolve));
  const current = refresh(templates); let latest;
  try {
    await require_completion(current); latest = adapter.get_snapshot();
  } finally {
    releases.forEach((release) => release());
    await Promise.allSettled([old, current]);
  }
  t.is(adapter.get_snapshot(), latest); t.is(latest.status, 'ready'); t.deepEqual(latest.issues, []);
});
