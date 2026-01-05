import test from 'ava';
import {
  collect_block_heading_candidates,
  collect_template_folder_candidates,
  filter_blocks_by_headings,
  parse_template_headings,
  parse_template_folders,
  SmartTemplates,
  stringify_template_headings,
  stringify_template_folders,
} from './smart_templates.js';

function make_smart_templates(settings = {}) {
  const env = {
    settings: {
      smart_templates: {
        template_folder: '',
        template_name: '',
        template_headings: '',
        ...settings,
      }
    },
    collections: {},
    config: {},
    create_env_getter(obj) {
      obj.env = env;
    },
    plugin: { app: {} },
  };
  const templates = new SmartTemplates(env);
  return { templates, env };
}

test('parse_template_headings returns an empty array for missing values', t => {
  t.deepEqual(parse_template_headings({}), []);
  t.deepEqual(parse_template_headings({ template_headings: '' }), []);
  t.deepEqual(parse_template_headings({ template_headings: null }), []);
});

test('parse_template_headings trims and deduplicates', t => {
  const settings = { template_headings: 'Intro, Summary ,Intro,, Details ' };
  t.deepEqual(parse_template_headings(settings), ['Intro', 'Summary', 'Details']);
});

test('stringify_template_headings joins headings with comma separation', t => {
  t.is(stringify_template_headings(['Intro', 'Summary', 'Details']), 'Intro, Summary, Details');
  t.is(stringify_template_headings([]), '');
});

test('parse_template_folders trims and deduplicates folders', t => {
  const settings = { template_folder: 'Templates, Docs ,Templates,, Archive ' };
  t.deepEqual(parse_template_folders(settings), ['Archive', 'Docs', 'Templates']);
});

test('stringify_template_folders joins folders with comma separation', t => {
  t.is(stringify_template_folders(['Templates', 'Docs', 'Archive']), 'Templates, Docs, Archive');
  t.is(stringify_template_folders([]), '');
});

test('collect_template_folder_candidates returns sorted unique folder names', t => {
  const sources = [
    { key: 'Templates/note.md' },
    { key: 'Templates/child/note.md' },
    { key: 'Notes/note.md' },
    { key: 'Notes/note.md' },
    { key: 'NoFolder.md' },
  ];

  t.deepEqual(
    collect_template_folder_candidates(sources),
    ['Notes', 'Templates', 'Templates/child']
  );
});

test('collect_block_heading_candidates extracts headings from block keys', t => {
  const blocks = [
    { key: 'note.md#Intro' },
    { key: 'note.md#Summary' },
    { key: 'another.md#Summary' },
    { key: 'missing-hash' },
  ];
  t.deepEqual(collect_block_heading_candidates(blocks), ['Intro', 'Summary']);
});

test('filter_blocks_by_headings matches blocks using heading suffix', t => {
  const blocks = [
    { key: 'note.md#Intro' },
    { key: 'note.md#Summary' },
    { key: 'note.md#Outro' },
  ];
  const headings = ['Summary', 'Other'];

  const matches = filter_blocks_by_headings(blocks, headings);

  t.is(matches.length, 1);
  t.is(matches[0].key, 'note.md#Summary');
});

test('settings_config uses render-compatible callbacks', t => {
  const { templates, env } = make_smart_templates();
  let reload_calls = 0;
  let folder_modal_calls = 0;
  templates.open_template_folder_modal = (...args) => {
    folder_modal_calls += 1;
    t.deepEqual(args, ['container', 'setting']);
  };
  templates.load_templates = () => {
    reload_calls += 1;
  };

  const config = templates.settings_config;

  t.is(typeof config.template_folder.callback, 'function');
  t.is(typeof config.template_name.callback, 'function');
  t.is(config.template_folder.type, 'button');

  config.template_folder.callback.call(templates, 'container', 'setting');
  config.template_name.callback.call(templates);

  t.is(folder_modal_calls, 1);
  t.is(reload_calls, 1);
  t.is(templates.settings, env.settings.smart_templates);
});

test('template folder selection invokes modal callback', t => {
  const { templates } = make_smart_templates();
  let called_args;
  templates.open_template_folder_modal = (...args) => {
    called_args = args;
  };

  const { template_folder } = templates.settings_config;

  template_folder.callback('container', 'setting');

  t.deepEqual(called_args, ['container', 'setting']);
});

test('build_template_folder_description reflects selection', t => {
  const { templates } = make_smart_templates({ template_folder: 'Templates' });

  t.is(
    templates.build_template_folder_description(),
    'Folders: Templates'
  );
  t.is(
    templates.build_template_folder_description('Projects/Templates, Docs'),
    'Folders: Docs, Projects/Templates'
  );
  t.is(
    templates.build_template_folder_description(''),
    'Select a folder to import matching notes as templates.'
  );
});

test('load_templates matches multiple folders and headings', t => {
  const env = {
    settings: {
      smart_templates: {
        template_folder: 'Templates, Docs',
        template_headings: 'Intro',
        template_name: '',
      },
    },
    smart_sources: {
      items: [
        { key: 'Templates/note.md' },
        { key: 'Docs/note.md' },
        { key: 'Other/note.md', metadata: { 'smart template': true } },
      ],
      filter(fn) {
        return this.items.filter(item => fn(item));
      },
    },
    smart_blocks: {
      items: {
        a: { key: 'block.md#Intro' },
        b: { key: 'block.md#Other' },
      },
    },
    create_env_getter(obj) {
      obj.env = env;
    },
    plugin: { app: { internalPlugins: { plugins: { templates: { instance: { options: { folder: 'Default' } } } } } } },
    collections: {},
  };

  const templates = new SmartTemplates(env);
  const created = [];
  templates.items = {};
  templates.create_or_update = ({ source_key }) => {
    created.push(source_key);
    templates.items[source_key] = { key: source_key, source: { key: source_key } };
  };

  templates.load_templates();

  t.deepEqual(
    created.sort(),
    ['Docs/note.md', 'Other/note.md', 'Templates/note.md', 'block.md#Intro']
  );

  // ensure cleanup removes non-matching templates
  templates.items['Old/note.md'] = { key: 'Old/note.md', source: { key: 'Old/note.md' } };
  templates.load_templates();
  t.false('Old/note.md' in templates.items);
});
