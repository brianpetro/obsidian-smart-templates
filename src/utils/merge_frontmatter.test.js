import test from 'ava';
import { merge_frontmatter } from './merge_frontmatter.js';

test('merges new scalar key', (t) => {
  const base = [
    '---',
    'title: A',
    '---',
  ];
  const patch = [
    '---',
    'category: x',
    '---',
  ];
  const merged = merge_frontmatter(base, patch).join('\n');
  t.regex(merged, /title:\s+A/u);
  t.regex(merged, /category:\s+x/u);
});

test('replaces duplicate scalar key', (t) => {
  const base = [
    '---',
    'title: Old',
    '---',
  ];
  const patch = [
    '---',
    'title: New',
    '---',
  ];
  const merged = merge_frontmatter(base, patch).join('\n');
  t.regex(merged, /title:\s+New/u);
  t.false(/Old/.test(merged));
});

test('unions tags lists without duplicates', (t) => {
  const base = [
    '---',
    'tags:',
    '  - a',
    '  - b',
    '---',
  ];
  const patch = [
    '---',
    'tags:',
    '  - b',
    '  - c',
    '---',
  ];
  const merged = merge_frontmatter(base, patch).join('\n');
  t.regex(merged, /tags:\s*\n\s+- a/u);
  t.regex(merged, /- b/u);
  t.regex(merged, /- c/u);
});