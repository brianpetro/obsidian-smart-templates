/**
 * Remove selected top-level frontmatter fields without rewriting other YAML.
 * Indented continuations and indentless list entries belong to their field.
 * Unrelated comments, whitespace, body text, and line endings are preserved.
 *
 * If no frontmatter remains, returns the body only.
 *
 * @param {string} markdown
 * @param {string[]} keys_to_remove
 * @returns {string}
 */
export function clean_frontmatter(markdown, keys_to_remove = []) {
  if (typeof markdown !== 'string') return '';
  if (!markdown || !keys_to_remove.length) return markdown;

  const lines = markdown.match(/[^\n]*(?:\n|$)/g).filter(Boolean);
  if (!/^\uFEFF?---[ \t]*(?:\r?\n|$)$/.test(lines[0])) return markdown;
  const close_index = lines.findIndex((line, index) => {
    return index > 0 && /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)$/.test(line);
  });
  if (close_index < 0) return markdown;

  const removed_keys = new Set(keys_to_remove);
  const kept_lines = [];
  let removing_field = false;
  let changed = false;
  for (const line of lines.slice(1, close_index)) {
    // Only unindented mapping keys are control fields, never nested YAML.
    const match = /^[-?][ \t]/.test(line) ? null : line.match(/^(?:"([^"\r\n]+)"|'((?:[^'\r\n]|'')+)'|([^\s#:'"][^:\r\n]*?))[ \t]*:/);
    if (match) {
      const key = (match[1] ?? match[2]?.replace(/''/g, "'") ?? match[3]).trim();
      removing_field = removed_keys.has(key);
      if (removing_field) {
        changed = true;
        continue;
      }
    } else if (removing_field && line.trim() && !/^\s*#/.test(line)) {
      if (/^[ \t]|^-(?:[ \t]|\r?$)/.test(line)) continue;
      removing_field = false;
    }
    kept_lines.push(line);
  }
  if (!changed) return markdown;

  const body = lines.slice(close_index + 1).join('');
  if (!kept_lines.some((line) => line.trim())) {
    return (markdown.startsWith('\uFEFF') ? '\uFEFF' : '') + body;
  }
  return lines[0] + kept_lines.join('') + lines[close_index] + body;
}
