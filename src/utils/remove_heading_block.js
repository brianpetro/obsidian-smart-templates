import { escape_reg_exp } from "./escape_reg_exp.js";

/**
 * @function remove_heading_block
 * @description
 * Removes all occurrences of the specified heading and its subsequent text
 * until the next heading or end-of-file.
 * @param {string} content
 * @param {string} headingName
 * @returns {string} content with that heading block removed
 */
export function remove_heading_block(content, headingName) {
  if (!content) return '';
  const lines = content.split('\n');
  const headingPattern = new RegExp(`^#{1,6}\\s+${escape_reg_exp(headingName)}\\s*$`);

  let result = [];
  let skipMode = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (headingPattern.test(line)) {
      skipMode = true;
      continue;
    }
    // If we see a new heading while skipping, stop skipping
    if (skipMode && /^#{1,6}\s+/.test(line)) {
      skipMode = false;
    }
    if (!skipMode) {
      result.push(line);
    }
  }
  return result.join('\n').trim();
}
