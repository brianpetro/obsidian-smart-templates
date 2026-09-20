import test from 'ava';
import { SmartBlock } from 'smart-blocks/smart_block.js';
import { BasesBlockContentAdapter, get_bases_view_links } from 'obsidian-smart-env-pro/src/adapters/smart-blocks/bases.js';
import { create_base_env } from '../../test_support/bases.js';

// Tests intentionally instantiate the EXISTING shared adapter. Production Templates
// never does so. The native query evaluator/filesystem are explicit host stand-ins.
test('P3-11/13/20: actual SmartBlock/Base adapter returns 225 rows and owns contextual temporary files', async (t) => {
  const { templates, env, add_base, add_source } = create_base_env(t);
  const base = add_base();
  const block = base.blocks[0];
  const rows = Array.from({ length: 225 }, (_, index) => ({ 'file.path': `Notes/${index}.md` }));
  rows.forEach((row) => add_source(row['file.path']));
  const temps = new Map();
  const queries = [];
  let deleted = 0;
  base.env = env;
  base.data.last_read = { hash: 'canonical' };
  base.read = async () => 'filters:\n  and:\n    - file.name == this.file.name\nviews:\n  - name: Templates\n';
  block.source = base;
  block._block_adapter = new BasesBlockContentAdapter(block);
  Object.defineProperty(block, 'block_adapter', { get: () => block._block_adapter });
  block.read = SmartBlock.prototype.read;
  env.obsidian_app = {
    cli: { handlers: new Map([['base:query', { handler: async (query) => {
      queries.push(query);
      t.true(temps.get(query.file).includes('file("Projects/A.md").name'));
      return rows;
    } }]]) },
    vault: {
      create: async (path, content) => { temps.set(path, content); env.events.emit('sources:created', { path }); return { path }; },
      delete: async ({ path }) => { deleted += 1; temps.delete(path); env.events.emit('sources:deleted', { path }); },
    },
  };
  const state = await templates.prepare_templates({ scope_source_key: 'Projects/A.md' });
  t.is(state.status, 'ready');
  t.is(state.visible_keys.length, 225);
  t.is(queries.length, 1); t.is(queries[0].format, 'json');
  t.is(deleted, 1); t.is(temps.size, 0);
  t.is(templates._removed_source_paths.size, 0, 'temporary files schedule no catalog cleanup');
  t.is(get_bases_view_links(rows).length, 200, 'using this helper would truncate the index');
  t.deepEqual(base.data.last_read, { hash: 'canonical' });
});

test('P3 storage: Base-discovered records persist, but scope membership disappears on reload', async (t) => {
  const { templates, env, files, add_base, add_source } = create_base_env(t);
  add_source('A.md'); add_base(undefined, undefined, () => [{ path: 'A.md' }]);
  await templates.prepare_templates({ scope_source_key: 'Projects/A.md' });
  await templates.process_save_queue({ force: true });
  const text = files.get(templates.data_adapter.get_item_data_path());
  t.true(text.includes('smart_templates:A.md'));
  t.false(text.includes('Projects/A.md'));
  t.false(text.includes('Catalog.base'));
  t.false(text.includes('visible_keys'));
  const restored = create_base_env(t, { data_fs: env.data_fs });
  restored.add_source('A.md'); restored.add_base();
  await restored.templates.data_adapter.process_load_queue();
  t.truthy(restored.templates.get('A.md'));
  t.false(restored.templates.get_visible_templates({ scope_source_key: 'Projects/A.md' }).some((item) => item.key === 'A.md'));
  t.is(restored.templates.get_discovery_state({ scope_source_key: 'Projects/A.md' }).status, 'unprepared');
});
