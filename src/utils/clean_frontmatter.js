/**
 * Removes specified keys from frontmatter and deletes empty frontmatter blocks.
 * @param {string} content
 * @param {string[]} keysToRemove
 * @returns {string}
 */
export function clean_frontmatter(content, keysToRemove = []) {
  if(!content || typeof content !== 'string') {
    // console.warn('clean_frontmatter: Invalid content provided, returning empty string.');
    return '';
  }
  if (!Array.isArray(keysToRemove) || keysToRemove.length === 0) return content;
  const keyRegex = new RegExp(`^(${keysToRemove.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*:`, 'i');
  return content.replace(
    /^---\s*[\r\n]+([\s\S]*?)\r?\n---\s*/,
    (match, frontmatter) => {
      const lines = frontmatter.split(/\r?\n/).filter(Boolean);
      const filtered = lines.filter(line => !keyRegex.test(line.trim()));
      if (filtered.length === 0) {
        return '';
      }
      return `---\n${filtered.join('\n')}\n---\n`;
    }
  ).replace(/^\s*---\s*\n---\s*$/, ''); // Remove empty frontmatter blocks
}