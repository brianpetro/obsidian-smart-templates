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

  // 1) Possibly extract from an intra-note heading if template_heading is defined
  let heading_content = null;
  if (settings.template_heading) {
    heading_content = await extract_intra_note_heading_content(
      source_item,
      settings.template_heading
    );
  }

  // 2) If merge_parent_templates => gather folder templates
  let parent_templates = null;
  if (settings.merge_parent_templates === true) {
    parent_templates = await find_template_file(source_item);
  }

  // 3) Merge logic
  //    a) If merge_parent_templates=true => parent_templates come first
  //    b) Then if heading_content from the current note is found => appended last
  //    c) If merge=false but we have heading_content, that alone is returned
  //    d) Else fallback to file-based approach, or possibly the entire note
  let finalContent = null;

  if (settings.merge_parent_templates === true) {
    // Merge parent templates + heading_content
    if (parent_templates) {
      finalContent = parent_templates;
      if (heading_content !== null) {
        finalContent += '\n\n' + heading_content;
      }
    } else {
      // If no parent templates found, just use heading_content if it exists
      if (heading_content !== null) {
        finalContent = heading_content;
      }
    }
  } else {
    // If merge_parent_templates=false
    if (heading_content !== null) {
      // Use heading_content directly
      finalContent = heading_content;
    } else {
      // fallback to file-based approach
      finalContent = await find_template_file(source_item);
      // If that was empty and we DO have a template_heading set,
      // return null (to match the test that expects null when heading not found).
      // Otherwise (no template_heading, or we specifically allow fallback),
      // read the entire note.
      if (!finalContent) {
        if (settings.template_heading) {
          // Return null if the user explicitly set a template heading,
          // but we can't find it in either the note or any folder file.
          return null;
        }
        // Otherwise fallback to entire note content
        finalContent = await read_source_file(source_item);
      }
    }
  }

  // If there's still nothing => null
  if (!finalContent) {
    return null;
  }

  // 4) If system_prompt_heading is set, remove that block entirely
  if (settings.system_prompt_heading) {
    finalContent = remove_heading_block(finalContent, settings.system_prompt_heading);
  }

  return finalContent || null;
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

  // Build template filename
  const template_name = settings.template_name?.endsWith('.md')
    ? settings.template_name
    : (settings.template_name || 'folder_template') + '.md';

  // Start with current folder's match
  const filter = {
    key_starts_with: curr_folder,
    key_ends_with: template_name
  };
  let items = env.smart_sources.filter(filter);

  // If merging => keep going up the folder path
  if (merge_parents) {
    while (curr_folder !== '') {
      curr_folder = get_folder_path(curr_folder);
      const path_to_match = curr_folder === '' ? template_name : curr_folder + '/' + template_name;
      const folder_level_items = env.smart_sources.filter(i => i.path === path_to_match);
      items.push(...folder_level_items);
    }
    // sort deeper paths first
    items.sort((a, b) => b.path.length - a.path.length);
  } else {
    // Not merging => keep items from current folder
  }

  // If no items found => null
  if (!items.length) return null;

  // If not merging => pick the single best match
  if (!merge_parents) {
    items.sort((a, b) => b.path.length - a.path.length);
    items = [items[0]];
  }

  // read each file, possibly extract heading
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const fileContent = await item.read();
    let portion = null;
    if (settings.template_heading) {
      portion = extract_heading_from_string(fileContent, settings.template_heading);
    }
    if (portion === null) {
      portion = fileContent; // fallback to entire file
    }
    results.push(portion);
  }

  // Merge with double newlines
  const merged = results.join('\n\n');
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
 * @function extract_intra_note_heading_content
 * @description Reads the current file's content. Searches for a heading that matches the given heading name.
 *   If found, returns the subsequent lines up to the next heading (or EOF). Omits the heading line itself.
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
 * @function remove_heading_block
 * @description Removes all occurrences of the specified heading and its subsequent text
 *   until the next heading or end-of-file.
 * @param {string} content
 * @param {string} headingName
 * @returns {string} content with that heading block removed
 */
function remove_heading_block(content, headingName) {
  if (!content) return '';
  const lines = content.split('\n');
  const headingPattern = new RegExp(`^#{1,6}\\s+${escapeRegExp(headingName)}\\s*$`);

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
 * @function read_source_file
 * @description Safely reads the source_item content. Returns string or null on error.
 * @param {Object} source_item
 * @returns {Promise<string|null>}
 */
async function read_source_file(source_item) {
  try {
    return await source_item.read();
  } catch (err) {
    console.warn('Error reading source_item:', err);
    return null;
  }
}

/**
 * @function escapeRegExp
 * @description Utility for safely creating a heading match pattern
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
