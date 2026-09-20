import test from 'ava';
import { smart_env_config } from '../../default.config.js';
import { create_base_env } from '../../test_support/bases.js';

function setup(t, opts = {}) {
  const fixture = create_base_env(t, { actions: smart_env_config.actions, settings: { template_base: '' } });
  const { env, add_base } = fixture;
  const files = new Map([['Templates', { path: 'Templates', children: [] }]]);
  const created = [];
  const opened = [];
  env.plugin.app = {
    internalPlugins: { plugins: { templates: { instance: { options: { folder: 'Templates' } } } } },
    workspace: {
      getActiveFile: () => ({ path: 'Projects/A.md' }),
      getLeaf: () => ({ openFile: async (file) => { if (opts.open_failure) throw new Error('Open failed'); opened.push(file); } }),
    },
    vault: {
      getAbstractFileByPath: (path) => files.get(path),
      create: async (path, content) => {
        if (files.has(path) || opts.competing_creation) throw new Error('Already exists');
        const file = { path, content }; files.set(path, file); created.push(file);
        if (!opts.refresh_failure) add_base(path);
        return file;
      },
    },
  };
  return { ...fixture, files, created, opened };
}

test('P3-26: create scaffold configures, refreshes, opens and returns the created file', async (t) => {
  const { templates, files, created, opened } = setup(t);
  const result = await templates.actions.smart_templates_create_base({});
  t.is(created.length, 1); t.is(result.file, created[0]);
  t.deepEqual([result.configured, result.refreshed, result.opened], [true, true, true]);
  t.deepEqual(result.issues, []);
  t.is(templates.settings.template_base, 'Templates/Smart Templates.base');
  t.is(templates.settings.template_base_view, 'Templates');
  t.is(opened[0], files.get(templates.settings.template_base));
});

test('P3 Create Base: missing native folder/occupied path/write race never mutates settings', async (t) => {
  for (const mode of ['missing', 'occupied', 'race']) {
    const { templates, env, files, created } = setup(t, { competing_creation: mode === 'race' });
    if (mode === 'missing') env.plugin.app.internalPlugins.plugins.templates.instance.options.folder = '';
    if (mode === 'occupied') files.set('Templates/Smart Templates.base', { content: 'original' });
    await t.throwsAsync(() => templates.actions.smart_templates_create_base());
    t.is(created.length, 0); t.is(templates.settings.template_base, '');
    if (mode === 'occupied') t.is(files.get('Templates/Smart Templates.base').content, 'original');
  }
});

test('P3 Create Base: refresh/open failure reports partial completion and never removes saved file', async (t) => {
  const { templates, files } = setup(t, { refresh_failure: true, open_failure: true });
  const result = await templates.actions.smart_templates_create_base();
  t.true(result.configured); t.false(result.refreshed); t.false(result.opened);
  t.is(result.issues.length, 2);
  t.is(files.get(result.file.path), result.file);
  await t.throwsAsync(() => templates.actions.smart_templates_create_base(), { message: /already exists/ });
});

test('P3 Create Base: existing folder scopes are retained rather than silently widened', async (t) => {
  const { templates, add_base, files } = setup(t);
  templates.settings.template_base_scopes = 'Projects | Other.base | Work';
  add_base('Other.base', ['Work']); files.set('Other.base', { path: 'Other.base' });
  const result = await templates.actions.smart_templates_create_base();
  t.true(result.configured); t.false(result.refreshed);
  t.is(templates.settings.template_base_scopes, 'Projects | Other.base | Work');
  t.true(result.opened);
});
