/**
 * Remove a heading block from markdown by exact heading text match.
 *
 * @param {string} markdown
 * @param {string} heading_text
 * @returns {string}
 */
export function remove_heading_block(markdown, heading_text) {
  if (!markdown || !heading_text) return String(markdown || '');

  const lines = String(markdown).split('\n');
  const target = String(heading_text).trim();

  let start_index = -1;
  let start_level = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (!match) continue;

    const level = match[1].length;
    const text = String(match[2] || '').trim();

    if (text === target) {
      start_index = i;
      start_level = level;
      break;
    }
  }

  if (start_index === -1) return String(markdown || '');

  let end_index = lines.length;
  for (let i = start_index + 1; i < lines.length; i += 1) {
    const match = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (!match) continue;

    const level = match[1].length;
    if (level <= start_level) {
      end_index = i;
      break;
    }
  }

  return [
    ...lines.slice(0, start_index),
    ...lines.slice(end_index),
  ].join('\n').trim();
}
