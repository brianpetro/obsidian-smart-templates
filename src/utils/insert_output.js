/**
 * insert_output_into_string
 *
 * Updated: now merges duplicate front‑matter keys (unions `tags` lists).
 */

import { merge_frontmatter } from './merge_frontmatter.js';

/**
 * Pure utility that returns the new file text after inserting `output`
 * one line *below* `cursor_line`.
 * … (original JSDoc unchanged) …
 */
export function insert_output(file_text, cursor_line, output) {
  if (typeof file_text !== 'string') file_text = '';
  if (!Number.isInteger(cursor_line) || cursor_line < 0) cursor_line = 0;
  if (typeof output !== 'string') output = '';

  const lines = file_text.split('\n');

  const is_fm_delim = (l) => l.trim() === '---';
  const has_frontmatter = is_fm_delim(lines[0]);
  const fm_close = has_frontmatter
    ? lines.slice(1).findIndex(is_fm_delim) + 1
    : -1;

  /* parse output ------------------------------------------------------ */
  const output_lines = output.replace(/\r\n/g, '\n').split('\n');

  let fm_block_lines = null;
  let rest_output_lines = output_lines;

  if (is_fm_delim(output_lines[0])) {
    const second_delim = output_lines.slice(1).findIndex(is_fm_delim);
    if (second_delim !== -1) {
      const closing_idx = second_delim + 1;
      fm_block_lines = output_lines.slice(0, closing_idx + 1);
      rest_output_lines = output_lines.slice(closing_idx + 1);
    }
  }

  const output_is_pure_fm =
    fm_block_lines !== null && rest_output_lines.length === 0;

  /* ─────────── No existing front‑matter ─────────── */
  if (!has_frontmatter) {
    if (output_is_pure_fm) {
      return [...fm_block_lines, ...lines].join('\n');
    }

    if (fm_block_lines) {
      const new_lines = [
        ...fm_block_lines,
        ...insert_output(lines.join('\n'), cursor_line, rest_output_lines.join('\n')).split('\n'),
      ];
      return new_lines.join('\n');
    }

    if (lines.length === 1 && lines[0] === '') {
      return ['---', ...output_lines, '---'].join('\n');
    }

    const insertion_idx = Math.min(cursor_line + 1, lines.length);
    lines.splice(insertion_idx, 0, ...output_lines);
    return lines.join('\n');
  }

  /* ─────────── Existing front‑matter ─────────── */
  if (cursor_line < fm_close) {
    /* inside FM: merge */
    const base_fm   = lines.slice(0, fm_close + 1);
    const patch_fm  = fm_block_lines ?? ['---', ...output_lines, '---'];
    const merged_fm = merge_frontmatter(base_fm, patch_fm);

    const after_fm  = lines.slice(fm_close + 1);
    const insertion_idx = Math.min(cursor_line + 1, merged_fm.length);
    const updated_after_fm = [...after_fm];

    if (!output_is_pure_fm && rest_output_lines.length) {
      updated_after_fm.splice(
        insertion_idx - merged_fm.length,
        0,
        ...rest_output_lines,
      );
    }

    return [...merged_fm, ...updated_after_fm].join('\n');
  }

  /* outside FM: */
  if (fm_block_lines) {
    const merged_fm = merge_frontmatter(lines.slice(0, fm_close + 1), fm_block_lines);
    const body      = lines.slice(fm_close + 1);
    const insertion_idx = Math.min(cursor_line + 1 - (fm_close + 1), body.length);
    body.splice(insertion_idx, 0, ...rest_output_lines);
    return [...merged_fm, ...body].join('\n');
  }

  const insertion_idx = Math.min(cursor_line + 1, lines.length);
  lines.splice(insertion_idx, 0, ...output_lines);
  return lines.join('\n');
}
