/**
 * @module get_dynamic_template
 * @description Retrieves a dynamic template based on the current file and settings.
 */

export async function get_dynamic_template(source_item, opts={}) {
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

  // 1) If template_heading is defined, try to extract that intra-note heading content
  if (settings.template_heading) {
    const heading_content = await extract_intra_note_heading_content(source_item, settings.template_heading);
    if (heading_content !== null) {
      // Found the heading => return it
      return heading_content;
    }
    // else fall back to existing approach
  }

  // 2) Fallback to file-based approach
  const file_template_content = await find_template_file(source_item);
  if (file_template_content) {
    return file_template_content;
  }
  return null;
}

/**
 * @function find_template_file
 * @description Searches the current folder and parents for a file named `file_name`.
 *   If merge_parents=true, concatenates content from all matching up to root (child folder first).
 *   Otherwise returns the first match found from bottom up.
 * @param {Object} source_item
 * @param {Object} [opts={}]
 * @returns {Promise<string|null>} resolved content or null
 */
async function find_template_file(source_item, opts={}) {
  const env = source_item.env;
  const source_path = source_item.path;
  let curr_folder = opts.current_path ?? get_folder_path(source_path);
  if (!env) {
    console.warn('get_dynamic_template: source_item.env not found in find_template_file.');
    return 'No matching template.';
  }
  const settings = env.smart_templates?.settings || {};
  const template_name = (settings.template_name?.endsWith('.md') ? settings.template_name : (settings.template_name || 'folder_template') + '.md');
  console.log("template_name", template_name);
  const filter = {
    key_starts_with: curr_folder,
    key_ends_with: template_name,
  };
  const items = env.smart_sources.filter(filter);
  console.log("items", items);
  const merge_parents = settings.merge_parent_templates === true;
  console.log("merge_parents", merge_parents);

  if (merge_parents) {
    while (curr_folder !== '') {
      curr_folder = get_folder_path(curr_folder);
      console.log("curr_folder", curr_folder);
      filter.key_starts_with = curr_folder;
      const path_to_match = curr_folder === '' ? template_name : curr_folder + '/' + template_name;
      const folder_level_items = env.smart_sources.filter(i => {
        return i.path === path_to_match;
      });
      items.push(...folder_level_items);
    }
    console.log("items_with_parents", items);
    // sort by shortest path first
    items.sort((a, b) => a.path.length - b.path.length);
    let merged_content = '';
    for (const item of items) {
      if (merged_content.length > 0) {
        merged_content += '\n\n';
      }
      merged_content += await item.read();
    }
    return merged_content;
  } else {
    if (items.length) {
      // longest path first
      items.sort((a, b) => b.path.length - a.path.length);
      return await items[0].read();
    }
  }
  return null;
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
 *   If not found, returns null.
 * @param {Object} source_item
 * @param {string} template_heading
 * @returns {Promise<string|null>}
 */
async function extract_intra_note_heading_content(source_item, template_heading) {
  try {
    const content = await source_item.read();
    if (!content) return null;

    // Normal line-based approach
    const lines = content.split('\n');
    let headingLineIndex = -1;
    const headingPattern = new RegExp(`^#{1,6}\\s+${escapeRegExp(template_heading)}\\s*$`);

    // 1) find the line that matches the heading
    for (let i = 0; i < lines.length; i++) {
      if (headingPattern.test(lines[i])) {
        headingLineIndex = i;
        break;
      }
    }
    if (headingLineIndex === -1) {
      return null;
    }

    // 2) gather subsequent lines until next heading or end of file
    let subsequent = [];
    for (let j = headingLineIndex + 1; j < lines.length; j++) {
      // if next heading => break
      if (/^#{1,6}\s+/.test(lines[j])) {
        break;
      }
      subsequent.push(lines[j]);
    }

    // remove trailing empty lines, but keep structure
    while (subsequent.length && !subsequent[subsequent.length - 1].trim()) {
      subsequent.pop();
    }

    // join them
    const result = subsequent.join('\n').trim();
    if (!result) {
      // if no content after heading, let's return an empty string or something
      return '';
    }
    return result;
  } catch (err) {
    console.warn('extract_intra_note_heading_content error:', err);
    return null;
  }
}

/**
 * Simple escapeRegExp to safely build a heading pattern.
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
