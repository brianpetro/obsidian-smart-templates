/**
 * @module get_dynamic_template
 * @description Retrieves a dynamic template based on the current file and settings.
 */

/**
 * @function get_dynamic_template
 * @param {Object} source_item
 * @param {Object} [opts={}]
 * @returns {Promise<string|null>} dynamic template content or null if none
 */
export async function get_dynamic_template(source_item, opts = {}) {
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

  // If template_heading is defined
  if (settings.template_heading) {
    const heading_content = await extract_intra_note_heading_content(
      source_item,
      settings.template_heading
    );

    // If merge_parent_templates is true, gather folder templates (child → root), each may parse out heading
    if (settings.merge_parent_templates === true) {
      const parent_templates = await find_template_file(source_item);
      if (parent_templates) {
        // If heading is found in the current note, it goes last
        if (heading_content !== null) {
          return parent_templates + '\n\n' + heading_content;
        }
        // No heading found in the note => just return parent templates
        return parent_templates;
      }
      // If no parent templates found, but heading_content is present => return heading alone
      if (heading_content !== null) {
        return heading_content;
      }
      // Otherwise => null
      return null;
    }

    // If merge_parent_templates is false, but heading_content is present => return it
    if (heading_content !== null) {
      return heading_content;
    }
    // If heading not found => fallback to file-based approach
  }

  // Otherwise fallback to file-based approach
  const file_template_content = await find_template_file(source_item);
  if (file_template_content) {
    return file_template_content;
  }
  return null;
}

/**
 * @function find_template_file
 * @description Searches the current folder and parents for a file named `template_name.md`.
 *   If merge_parents=true, merges content from child folder first up to root.
 *   For each file:
 *     - if `template_heading` is set and found in that file, only that heading portion is used
 *     - otherwise, the entire file is used
 * @param {Object} source_item
 * @param {Object} [opts={}]
 * @returns {Promise<string|null>} resolved content or null
 */
async function find_template_file(source_item, opts = {}) {
  const env = source_item.env;
  const source_path = source_item.path;
  let curr_folder = opts.current_path ?? get_folder_path(source_path);
  if (!env) {
    console.warn('get_dynamic_template: source_item.env not found in find_template_file.');
    return 'No matching template.';
  }
  const settings = env.smart_templates?.settings || {};
  const merge_parents = settings.merge_parent_templates === true;

  // Build the actual template filename
  const template_name = settings.template_name?.endsWith('.md')
    ? settings.template_name
    : (settings.template_name || 'folder_template') + '.md';

  // Start with the current folder's matching template(s)
  const filter = {
    key_starts_with: curr_folder,
    key_ends_with: template_name
  };
  let items = env.smart_sources.filter(filter);

  // If merging, keep going up the folder path
  if (merge_parents) {
    while (curr_folder !== '') {
      curr_folder = get_folder_path(curr_folder);
      const path_to_match = curr_folder === '' ? template_name : curr_folder + '/' + template_name;
      const folder_level_items = env.smart_sources.filter(i => i.path === path_to_match);
      items.push(...folder_level_items);
    }
    // Sort so deeper items come first
    items.sort((a, b) => b.path.length - a.path.length);
  } else {
    // Not merging => keep only 'items' from current folder
    // Then pick the single best (longest path) below
  }

  // If no items found, return null
  if (!items.length) return null;

  // If not merging => pick the single best match
  if (!merge_parents) {
    items.sort((a, b) => b.path.length - a.path.length);
    items = [items[0]];
  }

  // For each file, read & possibly extract heading content
  let merged = '';
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const fileContent = await item.read();
    // If the template file itself has the heading, only use that portion
    let portion = null;
    if (settings.template_heading) {
      portion = extract_heading_from_string(fileContent, settings.template_heading);
    }
    if (portion === null) {
      portion = fileContent; // fallback: entire file
    }
    if (merged) {
      merged += '\n\n';
    }
    merged += portion;
  }

  return merged || null;
}

/**
 * @function extract_heading_from_string
 * @description Extract content under `headingName` in a string. If found, return just that block;
 *   if not found, return null.
 * @param {string} fileContent
 * @param {string} headingName
 * @returns {string|null}
 */
function extract_heading_from_string(fileContent, headingName) {
  if (!fileContent) return null;
  const lines = fileContent.split('\n');
  let headingLineIndex = -1;
  const headingPattern = new RegExp(`^#{1,6}\\s+${escapeRegExp(headingName)}\\s*$`);

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

/**
 * @function get_folder_path
 * @description Extracts the folder portion from a file path (the part before the last slash).
 * @param {string} file_path
 * @returns {string} folder path or empty if none
 */
function get_folder_path(file_path) {
  if (!file_path.includes('/')) return '';
  const parts = file_path.split('/');
  parts.pop();
  return parts.join('/');
}

/**
 * @function extract_intra_note_heading_content
 * @description Reads the current file's content. Searches for a heading that matches the given heading name.
 *   If found, returns the subsequent lines up to the next heading (or end of file). Omits the heading line itself.
 * @param {Object} source_item
 * @param {string} template_heading
 * @returns {Promise<string|null>}
 */
async function extract_intra_note_heading_content(source_item, template_heading) {
  try {
    const content = await source_item.read();
    if (!content) return null;
    return extract_heading_from_string(content, template_heading);
  } catch (err) {
    console.warn('extract_intra_note_heading_content error:', err);
    return null;
  }
}

/**
 * @function escapeRegExp
 * @description Simple utility for safely creating a heading match pattern
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
