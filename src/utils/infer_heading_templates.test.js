import test from 'ava';
import { infer_heading_templates, normalize_heading_inference_params, compare_code_points } from './infer_heading_templates.js';
import { heading_observation as observe } from '../test_support/heading_inference.js';

const opts = { min_support: 1, exclude_document_title: false };

test('P4-01/03/06: exact NFKC/case/space normalization and global/skipped level shifts cluster identically', (t) => {
  const a = observe('A.md', [[1, 'Ｗｈｙ'], [3, 'Evidence  Here'], [2, 'Next']]);
  const b = observe('B.md', [[2, 'why'], [5, 'evidence here'], [3, 'next']]);
  const before = JSON.stringify([a, b]);
  const result = infer_heading_templates([b, a], { include_source_keys: true, exclude_document_title: false });
  t.is(result.templates.length, 1);
  t.is(result.templates[0].signature, '[[0,"why"],[1,"evidence here"],[1,"next"]]');
  t.is(result.templates[0].support, 2);
  t.is(result.templates[0].coverage, 1);
  t.is(result.templates[0].content, '## Ｗｈｙ\n\n### Evidence  Here\n\n### Next\n');
  t.deepEqual(result.templates[0].source_keys, ['A.md', 'B.md']);
  t.is(JSON.stringify([a, b]), before);
});

test('P4-04/05/06: order, hierarchy, punctuation, numbers and repeated positions stay distinct', (t) => {
  const rows = [
    [[2, 'A'], [2, 'B']], [[2, 'B'], [2, 'A']], [[2, 'A'], [3, 'B']],
    [[2, 'A!'], [2, 'B']], [[2, 'A1'], [2, 'B']], [[2, 'A'], [2, 'A']],
  ];
  const result = infer_heading_templates(rows.map((row, index) => observe(`${index}.md`, row)), opts);
  t.is(new Set(result.templates.map(({ signature }) => signature)).size, 6);
  t.is(result.eligible_source_count, 6);
});

test('P4-07: remove title by normalized basename or sole outer ancestry, not arbitrary first H1', (t) => {
  const by_name = observe('My Note.md', [[1, 'MY   NOTE'], [2, 'Why'], [1, 'Next']]);
  const by_ancestry = observe('Other.md', [[1, 'Arbitrary Title'], [2, 'Why'], [2, 'Next']]);
  const keep = observe('Other.md', [[1, 'A'], [1, 'B']]);
  t.is(infer_heading_templates([by_name], { min_support: 1 }).templates[0].signature, '[[0,"why"],[0,"next"]]');
  t.is(infer_heading_templates([by_ancestry], { min_support: 1 }).templates[0].signature, '[[0,"why"],[0,"next"]]');
  t.is(infer_heading_templates([keep], { min_support: 1 }).templates[0].signature, '[[0,"a"],[0,"b"]]');
  t.is(infer_heading_templates([by_ancestry], opts).templates[0].heading_count, 3);
});

test('P4: rejected parent rebases to nearest retained ancestor rather than absolute Markdown level', (t) => {
  const source = observe('N.md', [[1, 'Root'], [2, 'Dropped', 0.4], [4, 'Leaf'], [2, 'Sibling']]);
  const result = infer_heading_templates([source], { ...opts, min_heading_confidence: 0.75 });
  t.is(result.templates[0].signature, '[[0,"root"],[1,"leaf"],[1,"sibling"]]');
});

test('P4-09: inspected and eligible denominators precede min-support/output filtering', (t) => {
  const a = observe('A.md', [[2, 'A'], [2, 'B']]);
  const b = observe('B.md', [[2, 'A'], [2, 'B']]);
  const c = observe('C.md', [[2, 'B'], [2, 'A']]);
  const invalid = { source_key: 'D.md', headings: [], issues: [{ source_key: 'D.md', code: 'invalid', message: 'invalid' }] };
  const short = observe('E.md', [[2, 'A']]);
  const result = infer_heading_templates([a, b, c, invalid, short]);
  t.is(result.inspected_source_count, 5);
  t.is(result.eligible_source_count, 3);
  t.is(result.templates[0].support, 2);
  t.is(result.templates[0].coverage, 2 / 3);
  t.is(result.issues.length, 1);
  t.is(infer_heading_templates([a, b, c], { min_support: 4 }).eligible_source_count, 3);
});

test('P4: display spelling uses frequency, earliest exact supporting source, then code-point order', (t) => {
  const sources = [
    observe('Z.md', [[2, 'WHY'], [2, 'Next']]),
    observe('A.md', [[2, 'Why'], [2, 'Next']]),
    observe('B.md', [[2, 'WHY'], [2, 'Next']]),
  ];
  t.is(infer_heading_templates(sources).templates[0].headings[0].title, 'WHY');
  t.is(infer_heading_templates(sources.slice(0, 2)).templates[0].headings[0].title, 'Why');
  t.true(compare_code_points('\uE000', '\u{10000}') < 0);
});

test('P4: ranking is support then heading count then signature; max_templates changes output only', (t) => {
  const sources = [
    observe('A.md', [[2, 'Z'], [2, 'Z']]), observe('B.md', [[2, 'Z'], [2, 'Z']]),
    observe('C.md', [[2, 'B'], [2, 'B'], [2, 'B']]), observe('D.md', [[2, 'A'], [2, 'A'], [2, 'A']]),
  ];
  const result = infer_heading_templates(sources, { ...opts, max_templates: 2 });
  t.is(result.eligible_source_count, 4);
  t.deepEqual(result.templates.map(({ support, heading_count, headings }) => [support, heading_count, headings[0].title]), [[2, 2, 'Z'], [1, 3, 'A']]);
});

test('P4: rendering lowers the preferred root to fit depth and rejects over-six-level synthetic skeletons', (t) => {
  const source = observe('N.md', [[1, 'A'], [2, 'B'], [3, 'C']]);
  t.is(infer_heading_templates([source], { ...opts, base_heading_level: 6 }).templates[0].content, '#### A\n\n##### B\n\n###### C\n');
  const too_deep = observe('N.md', Array.from({ length: 7 }, (_, i) => [i + 1, 'A']));
  t.is(infer_heading_templates([too_deep], opts).eligible_source_count, 0);
  t.is(infer_heading_templates([too_deep], opts).issues[0].code, 'heading_depth_unsupported');
});

test('P4-10: signature collision is checked before output truncation, with no silent winner', (t) => {
  const sources = [observe('A.md', [[2, 'A'], [2, 'B']]), observe('B.md', [[2, 'C'], [2, 'D']])];
  t.throws(() => infer_heading_templates(sources, { ...opts, max_templates: 1 }, () => 'collision'), { message: /signature collision/ });
  const result = infer_heading_templates(sources, opts);
  t.true(result.templates.every(({ key }) => /^derived_headings:[a-z0-9]+$/.test(key)));
  t.deepEqual(result, infer_heading_templates(sources.slice().reverse(), opts));
});

test('P4: empty/whitelisted corpus has finite counts; source diagnostics are optional, never duplicates', (t) => {
  const source = observe('A.md', [[2, 'A'], [2, 'B']]);
  t.deepEqual(infer_heading_templates([], opts), { templates: [], inspected_source_count: 0, eligible_source_count: 0, issues: [] });
  t.is(infer_heading_templates([source], { ...opts, source_keys: [] }).inspected_source_count, 0);
  t.falsy('source_keys' in infer_heading_templates([source], opts).templates[0]);
  t.throws(() => infer_heading_templates([source, source], opts), { message: /Duplicate inference source/ });
});

test('P4: parameter validation is explicit and preserves exact whitelist keys', (t) => {
  for (const params of [{ min_support: 0 }, { max_templates: 1.5 }, { min_heading_count: -1 },
    { base_heading_level: 7 }, { min_heading_confidence: NaN }, { min_heading_confidence: 2 },
    { exclude_document_title: 'true' }, { include_source_keys: 1 }, { source_keys: null }, { source_keys: [''] }]) {
    t.throws(() => normalize_heading_inference_params(params));
  }
  t.deepEqual(normalize_heading_inference_params({ source_keys: [' B.md', 'A.md', 'A.md'] }).source_keys, [' B.md', 'A.md']);
});
