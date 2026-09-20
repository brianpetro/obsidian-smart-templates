import test from 'ava';
import {
  build_template_base_content, extract_template_base_paths, has_template_base_config,
  parse_template_base_config, resolve_template_base,
} from './template_base.js';

test('P3-05/06: longest folder-boundary mapping replaces, not merges, the default', (t) => {
  const config = parse_template_base_config({
    template_base: 'Default.base', template_base_view: 'All',
    template_base_scopes: 'Projects | Projects.base | Work\nProjects/Client | Clients.base | Specific',
  });
  t.deepEqual(resolve_template_base(config, 'Projects/Client/A.md'), { folder: 'Projects/Client', base_key: 'Clients.base', view_name: 'Specific' });
  t.is(resolve_template_base(config, 'Projects/B.md').base_key, 'Projects.base');
  t.is(resolve_template_base(config, 'Projects-Archive/A.md').base_key, 'Default.base');
  t.is(resolve_template_base(config, null).base_key, 'Default.base');
});

test('P3 settings: invalid mappings fail closed; whitespace-only settings retain legacy mode', (t) => {
  t.false(has_template_base_config({ template_base: ' ', template_base_scopes: '\n' }));
  t.true(has_template_base_config({ template_base: '../invalid.base' }));
  for (const template_base of ['../A.base', '/A.base', 'A.md', 'A.base#View', 'C:\\A.base']) {
    t.throws(() => parse_template_base_config({ template_base }));
  }
  for (const line of ['Projects', 'Projects | A.base | One | Two', 'Projects | A.base\nProjects | B.base']) {
    t.throws(() => parse_template_base_config({ template_base_scopes: line }));
  }
});

test('P3-11: structured full paths only, stable deduplication and no row limit', (t) => {
  const rows = Array.from({ length: 240 }, (_, index) => ({ 'file.path': `T/${index}.md` }));
  rows.push({ file: { path: 'T/A.txt' } }, { note: { file: { path: 'T/B.md' } } }, { path: 'T/0.md' });
  rows.push({ 'file.name': 'Display name' }, { file: '[[T/C]]' }, { path: '../Outside.md' }, { path: 'T/C.png' });
  const result = extract_template_base_paths(rows);
  t.is(result.keys.length, 242);
  t.is(result.unusable_rows, 4);
  t.throws(() => extract_template_base_paths({ rows }));
});

test('P3-26: generated Base has a dedicated full-path view without contextual formulas or limits', (t) => {
  const content = build_template_base_content('A "quoted" folder');
  const formulas = content.split('\n').filter((line) => line.startsWith('    - ')).map((line) => JSON.parse(line.slice(6)));
  t.deepEqual(formulas, ['file.ext == "md"', 'file.inFolder("A \\"quoted\\" folder")']);
  t.true(content.includes('name: Templates\n    order:\n      - file.path\n      - file.name'));
  t.false(/\blimit:|\bthis\./.test(content));
  t.throws(() => build_template_base_content('../Outside'));
});
