/**
 * @module get_dynamic_template
 * @description Retrieves a dynamic template from:
 * 1) Intra-note heading if `env.smart_templates.settings.template_heading` is set and found in the current file
 * 2) Searches upward for a file named `{{template_heading}}.md`
 * 3) (Optional) Also checks for a `+template.md` fallback
 * 4) If `merge_parent_templates` is true, it concatenates any matching templates from each parent folder
 *
 * Usage:
 *   const result = await get_dynamic_template({ source_item });
 *   // Insert `result` into the editor or do other plugin logic
 */

export async function get_dynamic_template({ source_item }) {
  if (!source_item) {
    console.warn('get_dynamic_template: Missing source_item.');
    return 'No matching template.';
  }
  const env = source_item.env;
  if (!env) {
    console.warn('get_dynamic_template: source_item.env not found.');
    return 'No matching template.';
  }

  const settings = env.smart_templates?.settings || {};
  const template_heading = settings.template_heading;
  const merge_parents = settings.merge_parent_templates === true;
  // If you want to re-enable the '+template.md' fallback, set this to true or read from settings
  const check_plus_template = true; // Or e.g. settings.check_plus_template

  const fs = source_item.collection.fs;
  const file_path = source_item.path;

  // Step 1) If template_heading is set, read current file for that heading
  if (template_heading) {
    try {
      const current_file_content = await fs.read(file_path, 'utf-8');
      const extracted = extract_heading_content(current_file_content, template_heading);
      if (extracted) {
        return extracted;
      }
    } catch (err) {
      console.warn('Error reading current file for heading:', template_heading, err);
    }
  }

  // Step 2) If not found, or template_heading not set, attempt searching upward for `{{template_heading}}.md`
  //         If template_heading is not set, skip this step
  if (template_heading) {
    const found_upward = await find_upward_file_content({
      fs,
      start_folder: get_folder_path(file_path),
      file_name: `${template_heading}.md`,
      merge_parents
    });
    if (found_upward) {
      return found_upward;
    }
  }

  // Step 3) Optionally check for "+template.md" if none found
  if (check_plus_template) {
    const plus_template_content = await find_upward_file_content({
      fs,
      start_folder: get_folder_path(file_path),
      file_name: '+template.md',
      merge_parents
    });
    if (plus_template_content) {
      return plus_template_content;
    }
  }

  // Step 4) If no matches, return "No matching template."
  return 'No matching template.';
}

/**
 * @function extract_heading_content
 * @description Looks for a heading in fileContent that matches headingName (case-insensitive),
 *   returning subsequent lines until the next heading or file end. Omits the heading line itself.
 * @param {string} fileContent
 * @param {string} headingName
 * @returns {string|null}
 */
function extract_heading_content(fileContent, headingName) {
  const lines = fileContent.split('\n');
  const headingRegex = new RegExp(`^#{1,6}\\s+${escape_regex(headingName)}\\s*$`, 'i');

  let startIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingRegex.test(lines[i].trim())) {
      startIndex = i;
      break;
    }
  }
  if (startIndex < 0) return null;

  const resultLines = [];
  for (let j = startIndex + 1; j < lines.length; j++) {
    if (/^#{1,6}\s+/.test(lines[j].trim())) {
      break;
    }
    resultLines.push(lines[j]);
  }
  const extracted = resultLines.join('\n').trim();
  return extracted.length ? extracted : null;
}

/**
 * @function find_upward_file_content
 * @description Searches the current folder and parents for a file named `file_name`.
 *   If merge_parents=true, concatenates content from all matching up to root (child folder first).
 *   Otherwise returns the first match found from bottom up.
 * @param {Object} opts
 * @param {Object} opts.fs - a smart_fs instance
 * @param {string} opts.start_folder - folder path to begin searching
 * @param {string} opts.file_name - name of the file to look for
 * @param {boolean} [opts.merge_parents=false] - if true, merges matches
 * @returns {Promise<string|null>} resolved content or null
 */
async function find_upward_file_content({ fs, start_folder, file_name, merge_parents=false }) {
  let current = start_folder;
  const found_content = [];
  while (true) {
    if (!current) break;
    const candidate = current + '/' + file_name;
    if (await fs.exists(candidate)) {
      try {
        const content = await fs.read(candidate, 'utf-8');
        if (merge_parents) {
          // store the content, keep searching upward
          found_content.push(content);
        } else {
          return content;
        }
      } catch (err) {
        console.warn(`Error reading ${candidate}:`, err);
      }
    }
    const parent = parent_folder(current);
    if (!parent || parent === current) {
      break;
    }
    current = parent;
  }
  if (merge_parents && found_content.length) {
    // If "closest-to-root first", we might reverse the array. But the spec says:
    // "includes folder templates from parent folders, concatenates with closest-to-root first"
    // That means we want the top-most to appear first in the final string
    // so we reverse the found_content array (lowest first -> top-most last).
    found_content.reverse();
    return found_content.join('\n\n');
  }
  return null;
}

/**
 * @function get_folder_path
 * @description Extracts the folder portion from a file path (the part before the last slash).
 * @param {string} filePath
 * @returns {string} folder path or empty if none
 */
function get_folder_path(filePath) {
  if (!filePath.includes('/')) return '';
  const parts = filePath.split('/');
  parts.pop();
  return parts.join('/');
}

/**
 * @function parent_folder
 * @param {string} folderPath
 * @returns {string} the parent folder or '' if top-level
 */
function parent_folder(folderPath) {
  if (!folderPath.includes('/')) return '';
  const parts = folderPath.split('/');
  parts.pop();
  return parts.join('/');
}

/**
 * @function escape_regex
 * @param {string} str
 * @returns {string} escaped string safe for regex
 */
function escape_regex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
