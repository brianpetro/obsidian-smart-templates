import test from 'ava';
import { parse_markdown_blocks } from 'smart-blocks/parsers/markdown.js';
import { source_heading_skeleton } from './source_heading_skeleton.js';

function verify(content, transform = (blocks) => blocks) {
  const source_key = 'Note.md';
  const blocks = Object.entries(parse_markdown_blocks(content).blocks).map(([key, lines]) => ({ key: source_key + key, lines: [...lines] }));
  return source_heading_skeleton({ source_key, content, blocks: transform(blocks) });
}

test('P4 skeleton: actual parser ranges preserve authored hierarchy/order while excluding content and frontmatter', (t) => {
  const text = '---\ntitle: Note\n---\nPreamble\n# Note\n## Why\nBody\n- one\n- two\n### Evidence\n```md\n# Not a heading\n```\n## Next\n';
  const result = verify(text, (blocks) => blocks.reverse());
  t.deepEqual(result.issues, []);
  t.deepEqual(result.headings.map(({ title, level, confidence }) => [title, level, confidence]), [
    ['Note', 1, 1], ['Why', 2, 1], ['Evidence', 3, 1], ['Next', 2, 1],
  ]);
  t.is(result.headings[2].parent_key, result.headings[1].block_key);
  t.is(result.headings[3].parent_key, result.headings[0].block_key);
});

test('P4-02: identical legacy maps do not erase repeated versus authored suffix distinction', (t) => {
  const repeat = '# A\n# A\n';
  const literal = '# A\n# A[2]\n';
  t.deepEqual(parse_markdown_blocks(repeat).blocks, parse_markdown_blocks(literal).blocks);
  t.deepEqual(verify(repeat).headings.map(({ title }) => title), ['A', 'A']);
  t.deepEqual(verify(literal).headings.map(({ title }) => title), ['A', 'A[2]']);
});

test('P4-02/08: a parser key collision excludes the source, not just its lost heading', (t) => {
  const result = verify('# A\n# A\n# A[2]\n');
  t.deepEqual(result.headings, []);
  t.is(result.issues[0].code, 'heading_occurrence_ambiguous');
});

test('P4 skeleton: repeated nested headings preserve real authored suffixes', (t) => {
  const result = verify('# Parent\n## Child\n## Child\n## Child#{3}\n');
  t.deepEqual(result.issues, []);
  t.deepEqual(result.headings.map(({ title }) => title), ['Parent', 'Child', 'Child', 'Child#{3}']);
});

test('P4-08: missing content block or changed key/range rejects a shortened observation', (t) => {
  const text = '# A\nBody\n## B\n';
  t.is(verify(text, (blocks) => blocks.slice(1)).issues[0].code, 'source_index_mismatch');
  t.is(verify(text, (blocks) => blocks.map((block, index) => index ? block : { ...block, key: 'Note.md#Wrong' })).issues[0].code, 'source_index_mismatch');
  t.is(verify(text, (blocks) => blocks.map((block, index) => index ? block : { ...block, lines: [1, 2] })).issues[0].code, 'source_index_mismatch');
});

test('P4 skeleton: invalid ranges, duplicate keys and empty compatibility reads are explicit issues', (t) => {
  for (const lines of [[0, 2], [2, 1], [1, 99], [1], [1, NaN], null]) {
    t.is(verify('# A\n## B', (blocks) => [{ ...blocks[0], lines }, ...blocks.slice(1)]).issues[0].code, 'block_range_invalid');
  }
  t.is(verify('# A\n', (blocks) => [...blocks, blocks[0]]).issues[0].code, 'block_identity_ambiguous');
  t.is(source_heading_skeleton({ source_key: 'N.md', blocks: [], content: '' }).issues[0].code, 'source_content_unavailable');
});

test('P4 skeleton: CRLF source text is inspected without changing its heading spelling', (t) => {
  const result = verify('# Note\r\n## A [link](x) 2.0\r\n### Full-width Ｂ\r\n');
  t.deepEqual(result.issues, []);
  t.deepEqual(result.headings.map(({ title }) => title), ['Note', 'A [link](x) 2.0', 'Full-width Ｂ']);
});

test('P4 skeleton: unsupported/ambiguous containers are reported rather than treated as template headings', (t) => {
  for (const content of [
    '# A\n~~~md\n# code\n~~~\n', '# A\n````md\n# code\n````\n',
    '# A\n    ## indented code\n', '# A\n<!--\n# comment\n-->\n', '# A\n```md\n# code\n',
  ]) {
    const result = verify(content);
    t.deepEqual(result.headings, []);
    t.is(result.issues[0].code, 'heading_syntax_unsupported');
  }
});
