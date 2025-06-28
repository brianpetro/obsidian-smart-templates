import { escape_reg_exp } from "./escape_reg_exp.js";

/**
 * @function extract_heading_from_string
 * @description
 * Returns only the block of text under the specified heading (until the next heading or EOF).
 * If not found, returns null.
 * (Copied from prior get_dynamic_template logic, lightly modified.)
 * @param {string} fileContent
 * @param {string} headingName
 * @returns {string|null}
 */


export function extract_heading_from_string(fileContent, headingName) {
  if (!fileContent) return null;
  if (!fileContent.includes(headingName)) return fileContent;
  const lines = fileContent.split('\n');
  let headingLineIndex = -1;
  const headingPattern = new RegExp(`^#{1,6}\\s+${escape_reg_exp(headingName)}\\s*$`);

  for (let i = 0; i < lines.length; i++) {
    if (headingPattern.test(lines[i])) {
      headingLineIndex = i;
      break;
    }
  }
  if (headingLineIndex === -1) {
    return null;
  }

  const subsequent = [];
  for (let j = headingLineIndex + 1; j < lines.length; j++) {
    if (/^#{1,6}\s+/.test(lines[j])) {
      break;
    }
    subsequent.push(lines[j]);
  }

  // remove trailing blank lines
  while (subsequent.length && !subsequent[subsequent.length - 1].trim()) {
    subsequent.pop();
  }

  const result = subsequent.join('\n').trim();
  return result;
}
