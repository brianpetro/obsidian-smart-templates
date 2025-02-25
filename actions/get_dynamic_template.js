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

    // If merge_parent_templates is also true, gather parent folder templates first (child → root), then append heading content
    if (settings.merge_parent_templates === true) {
      const parent_templates = await find_template_file(source_item);
      if (parent_templates) {
        if (heading_content !== null) {
          // Child-first merged template content + heading last
          return parent_templates + '\n\n' + heading_content;
        }
        // No heading found; return just the merged parent templates
        return parent_templates;
      }
      // No parent templates, heading content present → just return heading
      if (heading_content !== null) {
        return heading_content;
      }
      // Otherwise neither found
      return null;
    }

    // If merge_parent_templates is false, but heading_content is present, return it
    if (heading_content !== null) {
      return heading_content;
    }
    // If heading not found, fall back to file-based approach
  }

  // Otherwise, or if heading not found, fallback to file-based approach
  const file_template_content = await find_template_file(source_item);
  if (file_template_content) {
    return file_template_content;
  }
  return null;
}

/**
 * @function find_template_file
 * @description Searches the current folder and parents for a file named `template_name.md`.
 *   If merge_parents=true, concatenates content from child folder first up to root.
 *   Otherwise returns the single best match (longest path).
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

  // Ensure we always look for X.md
  const template_name = settings.template_name?.endsWith('.md')
    ? settings.template_name
    : (settings.template_name || 'folder_template') + '.md';

  const merge_parents = settings.merge_parent_templates === true;
  console.log('template_name', template_name);
  console.log('merge_parents', merge_parents);

  // Start with the current folder's matching template(s)
  const filter = {
    key_starts_with: curr_folder,
    key_ends_with: template_name
  };
  const items = env.smart_sources.filter(filter);

  // If we need to merge from child → parent, traverse upward collecting matches
  if (merge_parents) {
    while (curr_folder !== '') {
      curr_folder = get_folder_path(curr_folder);
      const path_to_match = curr_folder === '' ? template_name : curr_folder + '/' + template_name;
      const folder_level_items = env.smart_sources.filter(i => {
        return i.path === path_to_match;
      });
      items.push(...folder_level_items);
    }

    // Sort so that the deepest path (largest path.length) appears first
    items.sort((a, b) => b.path.length - a.path.length);

    let merged_content = '';
    for (const item of items) {
      if (merged_content.length > 0) {
        merged_content += '\n\n';
      }
      merged_content += await item.read();
    }
    return merged_content || null;
  } else {
    // No merging, just return the best single match if any
    if (items.length) {
      // In non-merge scenario, pick the single 'longest path'
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
 *   If found, returns the lines up to the next heading (or end). Omits the heading line itself.
 * @param {Object} source_item
 * @param {string} template_heading
 * @returns {Promise<string|null>}
 */
async function extract_intra_note_heading_content(source_item, template_heading) {
  try {
    const content = await source_item.read();
    if (!content) return null;

    const lines = content.split('\n');
    let headingLineIndex = -1;
    const headingPattern = new RegExp(`^#{1,6}\\s+${escapeRegExp(template_heading)}\\s*$`);

    // find the line that matches the heading
    for (let i = 0; i < lines.length; i++) {
      if (headingPattern.test(lines[i])) {
        headingLineIndex = i;
        break;
      }
    }
    if (headingLineIndex === -1) {
      return null;
    }

    // gather subsequent lines until next heading or end
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
    if (!result) {
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
