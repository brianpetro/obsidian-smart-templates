import test from 'ava';
import { create_env } from '../../test_support/templates.js';

test('P2-04: legacy prepare preserves folder, flag, name and heading detection without mutation', async (t) => {
  const sources = {
    'Templates/A.md': { key: 'Templates/A.md' },
    'Elsewhere/Named.md': { key: 'Elsewhere/Named.md' },
    'Flag.md': { key: 'Flag.md', metadata: { 'smart template': true } },
    'Note.md': { key: 'Note.md' },
    'Templates-Archive/Excluded.md': { key: 'Templates-Archive/Excluded.md' },
  };
  const blocks = { 'Note.md#Form': { key: 'Note.md#Form' } };
  const { templates } = create_env(t, { sources, blocks, settings: { template_folder: 'Templates', template_name: 'Named', template_headings: 'Form' } });
  const adapter = templates.discovery_adapters.legacy;
  const result = await adapter.prepare();
  t.deepEqual(result.visible_keys, ['Templates/A.md', 'Elsewhere/Named.md', 'Flag.md', 'Note.md#Form']);
  t.deepEqual(Object.keys(templates.items), []);
  t.is(adapter.get_snapshot().status, 'unprepared');
});

test('P2: native Templates folder fallback and file path boundaries remain unchanged', async (t) => {
  const { templates, env } = create_env(t, { sources: {
    'Native/A.md': { key: 'Native/A.md' }, 'Native-Archive/A.md': { key: 'Native-Archive/A.md' },
  } });
  env.plugin.app.internalPlugins = { plugins: { templates: { instance: { options: { folder: 'Native' } } } } };
  t.deepEqual((await templates.discovery_adapters.legacy.prepare()).visible_keys, ['Native/A.md']);
});

test('P2: unavailable or pending indexes do not authorize a prune/import', async (t) => {
  const { templates, env } = create_env(t);
  const adapter = templates.discovery_adapters.legacy;
  env.collections.smart_sources = 'loading';
  await t.throwsAsync(() => adapter.prepare(), { message: /Smart Sources/ });
  env.collections.smart_sources = 'loaded';
  env.smart_sources.sources_re_import_queue.a = {};
  await t.throwsAsync(() => adapter.prepare(), { message: /queued source updates/ });
  delete env.smart_sources.sources_re_import_queue.a;
  env.settings.smart_templates.template_headings = 'Form';
  env.collections.smart_blocks = 'loading';
  await t.throwsAsync(() => adapter.prepare(), { message: /Smart Blocks/ });
});
