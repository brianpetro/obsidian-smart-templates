import { parse_frontmatter } from 'smart-sources/utils/parse_frontmatter.js';

/**
 * Remove selected keys from frontmatter and rebuild markdown.
 *
 * If no frontmatter remains, returns the body only.
 *
 * @param {string} markdown
 * @param {string[]} keys_to_remove
 * @returns {string}
 */
export function clean_frontmatter(markdown, keys_to_remove = []) {
  const input = String(markdown || '');
  if (!input.trim()) return input;

  const { frontmatter, body } = parse_frontmatter(input);
  if (!frontmatter || typeof frontmatter !== 'object' || !Object.keys(frontmatter).length) {
    return input.trim();
  }

  const next_frontmatter = { ...frontmatter };
  keys_to_remove.forEach((key) => {
    delete next_frontmatter[key];
  });

  const remaining_keys = Object.keys(next_frontmatter);
  if (!remaining_keys.length) {
    return String(body || '').trim();
  }

  const lines = ['---'];
  remaining_keys.forEach((key) => {
    const value = next_frontmatter[key];
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      value.forEach((entry) => {
        lines.push(`  - ${entry}`);
      });
      return;
    }
    lines.push(`${key}: ${value}`);
  });
  lines.push('---');
  lines.push('');
  lines.push(String(body || '').trim());

  return lines.join('\n').trim();
}
