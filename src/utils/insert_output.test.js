import test from 'ava';
import { insert_output } from './insert_output.js';

test('inserts below cursor when no front‑matter', (t) => {
  const start = 'First line\nSecond line';
  const out   = insert_output(start, 0, 'INS');
  t.is(out, 'First line\nINS\nSecond line');
});

test('creates front‑matter when absent and cursor at top', (t) => {
  const start = 'Title: Note';
  const out   = insert_output(start, 0, '---\ntags:\n  - a\n  - b\n---');
  t.is(out, '---\ntags:\n  - a\n  - b\n---\nTitle: Note');
});

test('keeps inside existing front‑matter', (t) => {
  const start = [
    '---',
    'title: A',
    '---',
    'Body',
  ].join('\n');
  const out = insert_output(start, 1, '---\ntags:\n  - b\n---');
  t.is(out, [
    '---',
    'title: A',
    'tags:',
    '  - b',
    '---',
    'Body',
  ].join('\n'));
});

test('when cursor is mid file insert output below cursor', (t) => {
  const start = 'a\nb\nc\nd\ne';
  const out   = insert_output(start, 2, 'INSERT');
  t.is(out, [
    'a',
    'b',
    'c',
    'INSERT',
    'd',
    'e',
  ].join('\n'));
});

test('when cursor is mid file and no existing frontmatter, should add frontmatter to the top of the file and insert the rest of the output below cursor line', (t) => {
  const start = 'a\nb\nc\nd\ne';
  const out   = insert_output(start, 2, '---\ntags:\n  - c\n---\nINSERT');
  t.is(out, [
    '---',
    'tags:',
    '  - c',
    '---',
    'a',
    'b',
    'c',
    'INSERT',
    'd',
    'e',
  ].join('\n'));
});