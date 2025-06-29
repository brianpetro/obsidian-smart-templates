/**
 * insert_output_into_string
 *
 * Pure utility that returns new file text after inserting `output`
 * one line *below* `cursor_line`.  Front-matter (YAML `---`) is
 * detected and respected:
 *
 *   • If the cursor is inside an existing front-matter block the
 *     insertion happens before its closing delimiter.
 *   • If the note lacks front-matter *and* the cursor is at the
 *     top of the file, a fresh block is created automatically
 *     (`---`, output, `---`).
 *
 * @param {string} file_text       – entire note
 * @param {number} cursor_line     – zero-based line index
 * @param {string} output          – text to insert (may span lines)
 * @returns {string}               – updated note
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

  /** Parse `output` --------------------------------------------- */
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

  /** Cases when the file has *NO* front-matter ------------------ */
  if (!has_frontmatter) {
    /* 1. Pure FM block; cursor anywhere – prepend FM. */
    if (output_is_pure_fm) {
      return [...fm_block_lines, ...lines].join('\n');
    }

    /* 2. Mixed output starting with FM; prepend FM, insert rest. */
    if (fm_block_lines) {
      const body_lines = [...lines];
      if (rest_output_lines.length) {
        const insertion_idx = Math.min(cursor_line + 1, body_lines.length);
        body_lines.splice(insertion_idx, 0, ...rest_output_lines);
      }
      return [...fm_block_lines, ...body_lines].join('\n');
    }

    /* 3. No FM in output. If file empty, wrap in new FM block. */
    if (lines.length === 1 && lines[0] === '') {
      return ['---', ...output_lines, '---'].join('\n');
    }

    /* 4. Simple insert below cursor. */
    const insertion_idx = Math.min(cursor_line + 1, lines.length);
    lines.splice(insertion_idx, 0, ...output_lines);
    return lines.join('\n');
  }

  /** File *HAS* existing front-matter --------------------------- */

  /* Inside existing FM → insert before closing delimiter. */
  if (cursor_line < fm_close) {
    const to_insert = fm_block_lines
      ? fm_block_lines.slice(1, -1).concat(rest_output_lines)
      : output_lines;
    lines.splice(fm_close, 0, ...to_insert);
    return lines.join('\n');
  }

  /* Outside FM → insert below cursor. */
  const insertion_idx = Math.min(cursor_line + 1, lines.length);
  lines.splice(insertion_idx, 0, ...output_lines);
  return lines.join('\n');
}
