import test from 'ava';
import {
  build_template_matcher, parse_template_folders, resolve_template_folders,
  parse_template_headings, filter_blocks_by_headings,
  collect_template_folder_candidates, collect_block_heading_candidates,
} from './template_discovery.js';

test('P2: folder normalization preserves path boundaries and native fallback', (t) => {
  t.deepEqual(parse_template_folders({ template_folder: 'B/, A, B' }), ['A', 'B']);
  t.deepEqual(resolve_template_folders({}, 'Native/'), ['Native']);
  t.deepEqual(resolve_template_folders({ template_folder: 'Custom' }, 'Native'), ['Custom']);
});

test('P2: legacy folder matcher excludes partial-prefix sibling folders', (t) => {
  const match = build_template_matcher({ template_folders: ['Templates'] });
  t.true(match({ key: 'Templates/A.md' }));
  t.false(match({ key: 'Templates-Archive/A.md' }));
});

test('P2: existing filename and frontmatter matching are preserved', (t) => {
  const match = build_template_matcher({ template_name: 'Form' });
  t.true(match({ key: 'Folder/Form.md' }));
  t.true(match({ key: 'Other.md', metadata: { 'smart template': true } }));
  t.false(match({ key: 'Other.md' }));
});

test('P2: heading selection retains exact terminal headings and deduplicated config', (t) => {
  const headings = parse_template_headings({ template_headings: ' Form, Summary, Form ' });
  t.deepEqual(headings, ['Form', 'Summary']);
  const blocks = ['A.md#Parent#Form', 'A.md#Summary', 'A.md#Format'].map((key) => ({ key }));
  t.deepEqual(filter_blocks_by_headings(blocks, headings), blocks.slice(0, 2));
});

test('P2: folder and heading chooser candidates remain stable sorted lists', (t) => {
  t.deepEqual(collect_template_folder_candidates([{ key: 'B/A.md' }, { key: 'A/B.md' }]), ['A', 'B']);
  t.deepEqual(collect_block_heading_candidates([{ key: 'A.md#Z' }, { key: 'B.md#A' }]), ['A', 'Z']);
});

test('P2: an empty matcher has no implicit all-vault fallback', (t) => {
  t.false(build_template_matcher()({ key: 'A.md' }));
  t.deepEqual(filter_blocks_by_headings([{ key: 'A.md#Form' }], []), []);
});
