import test from 'ava';
import { get_dynamic_templates } from './get_dynamic_templates.js';

/**
 * Helper: create mock environment with smart_sources and smart_templates collections.
 * Returns { env, mock_sources } 
 */
function make_mock_env(sources=[]) {
  const mock_sources_collection = {
    items: sources,
    filter(fnOrObj) {
      if (typeof fnOrObj === 'function') return this.items.filter(fnOrObj);
      const { key_starts_with, key_ends_with } = fnOrObj || {};
      return this.items.filter(i => {
        if (key_starts_with && !i.path.startsWith(key_starts_with)) return false;
        if (key_ends_with && !i.path.endsWith(key_ends_with)) return false;
        return true;
      });
    },
    get(path) {
      return this.items.find(i => i.path === path);
    }
  };

  const mock_templates_collection = {
    items: {},
    async create_or_update(data) {
      // if key already exists, update it
      let existing = this.items[data.key];
      if (!existing) {
        existing = { data: {}, env: this.env };
        this.items[data.key] = existing;
      }
      existing.data = { ...existing.data, ...data };
      return existing;
    },
    get(key) {
      return this.items[key];
    }
  };

  const env = {
    smart_sources: mock_sources_collection,
    smart_templates: {
      settings: {
        // default settings
        template_name: '',
        template_heading: '',
        merge_parent_templates: false,
        system_prompt_heading: ''
      },
      ...mock_templates_collection
    }
  };
  mock_templates_collection.env = env;
  mock_sources_collection.env = env;
  return env;
}

test('get_dynamic_templates returns empty array if no source_item', async t => {
  const result = await get_dynamic_templates(null);
  t.deepEqual(result, []);
});

test('get_dynamic_templates returns empty array if env missing', async t => {
  const source_item = { path: 'folder/subfolder/file.md' };
  const result = await get_dynamic_templates(source_item);
  t.deepEqual(result, []);
});

test('returns empty array if no template_name and no template_heading set', async t => {
  const env = make_mock_env();
  const source_item = { path: 'some/path/file.md', env };
  const result = await get_dynamic_templates(source_item);
  t.deepEqual(result, []);
});

test('collects a single best matching folder template if merge_parent_templates=false', async t => {
  const env = make_mock_env([
    { path: 'folder/subfolder/folder_template.md' },
    { path: 'folder_template.md' }
  ]);
  env.smart_templates.settings.template_name = 'folder_template';
  // no heading set, so no intra-note template
  env.smart_templates.settings.merge_parent_templates = false;

  const source_item = { path: 'folder/subfolder/file.md', env };
  const result = await get_dynamic_templates(source_item);

  t.is(result.length, 1, 'Should only pick best single match');
  t.true(result[0].data.key.includes('smart_template:folder/subfolder/folder_template.md'));
  t.is(result[0].data.source_key, 'folder/subfolder/folder_template.md');
});

test('collects multiple folder templates (child->root) if merge_parent_templates=true', async t => {
  const env = make_mock_env([
    { path: 'folder/subfolder/folder_template.md' },
    { path: 'folder/folder_template.md' },
    { path: 'folder_template.md' }
  ]);
  env.smart_templates.settings.template_name = 'folder_template';
  env.smart_templates.settings.merge_parent_templates = true;

  const source_item = { path: 'folder/subfolder/file.md', env };
  const result = await get_dynamic_templates(source_item);

  t.is(result.length, 3, 'Should return all matching templates from subfolder up to root');
  // check the order is subfolder, then folder, then root
  t.true(result[0].data.source_key === 'folder/subfolder/folder_template.md');
  t.true(result[1].data.source_key === 'folder/folder_template.md');
  t.true(result[2].data.source_key === 'folder_template.md');
});
