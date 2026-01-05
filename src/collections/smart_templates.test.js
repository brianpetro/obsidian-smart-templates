import test from 'ava';
import {
  collect_block_heading_candidates,
  filter_blocks_by_headings,
  parse_template_headings,
  stringify_template_headings,
} from './smart_templates.js';

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
