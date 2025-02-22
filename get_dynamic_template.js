/**
 * @module get_dynamic_template
 * @description Provides the function `get_dynamic_template` to retrieve a dynamic template
 * by scanning for:
 * 1) An intra-note '# template' heading
 * 2) A `+template.md` in the same folder or ancestor folders
 * 3) If the note or folder name starts with an emoji, searching in a special "💪 effort" folder
 * 4) Checking a 'context doc' or a 'context group doc' if found
 * 5) Fallback returning "No matching template."
 *
 * This logic mirrors the original Templater snippet but is suitable for use in
 * an Obsidian plugin command or other direct function call, without requiring Templater.
 *
 * Use:
 *   const result = await get_dynamic_template({ app, file_path });
 *   // Then insert `result` into the editor or do other plugin logic.
 *
 * Dependencies:
 *   - This code expects an `app` object from Obsidian that at least supports:
 *       app.vault.getAbstractFileByPath(path)
 *       app.vault.read(file)
 *       app.vault.getMarkdownFiles()
 *       as well as your own logic to handle `file_exists` or `read_file_content`.
 */

export async function get_dynamic_template({ app, file_path }) {
  // final text to return if a suitable template is found
  // or 'No matching template.' if nothing applies
  let template_content = '';

  // acquire basic info
  const file_name = get_file_name(file_path);
  const folder_path = get_folder_of_path(file_path);
  const file_content = await read_file_content(app, file_path);

  // 1) If the note contains "# template"
  if (file_content.includes('# template')) {
    const included = await include_file_section(app, file_path, 'template');
    if (included) {
      return remove_template_header(included);
    }
  }

  // 2) Traverse folder structure for a "+template.md" file
  let context_folder_path = folder_path;
  while (context_folder_path.includes('/')) {
    const candidate_path = `${context_folder_path}/+template.md`;
    if (await file_exists(app, candidate_path)) {
      const included = await read_file_content(app, candidate_path);
      // compare to current file content. If different, return
      if (included !== file_content) {
        return remove_template_header(included);
      }
    }
    // move up
    context_folder_path = context_folder_path.split('/').slice(0, -1).join('/');
  }

  // 3) Check if the file or folder name has an emoji
  if (has_emoji(file_name) || has_emoji(folder_path)) {
    const found_emoji = has_emoji(file_name) || has_emoji(folder_path);
    // from original snippet: we look in "💪 effort"
    const target_folder = '💪 effort';
    // gather files from that folder
    const all_md_files = app.vault.getMarkdownFiles();
    const files_in_folder = all_md_files.filter(f => f.path.includes(target_folder));
    const matching_files = files_in_folder.filter(f => {
      const base = get_file_name(f.path);
      return base.includes(found_emoji);
    });
    for (let i = 0; i < matching_files.length; i++) {
      try {
        const included = await include_file_section(app, matching_files[i].path, 'template');
        if (included) {
          return remove_template_header(included);
        }
      } catch (e) {
        console.log(e);
        continue;
      }
    }
  }

  // 4) Optional: check "context doc" or "context group doc"
  //   This part from original snippet uses has_context_doc/has_context_group_doc
  //   If you do not use these in your environment, you can remove it or keep it
  const context_doc_name = await has_context_doc(app, folder_path, folder_path);
  if (context_doc_name) {
    const included = await include_file_section(app, `${folder_path}/${context_doc_name}.md`, 'template');
    if (included && included.includes('# template')) {
      return remove_template_header(included);
    }
  }

  const context_group_doc_name = await has_context_group_doc(app, folder_path);
  if (context_group_doc_name) {
    const included = await include_file_section(app, context_group_doc_name, 'template');
    if (included && included !== file_content) {
      return remove_template_header(included);
    }
  }

  // 5) fallback
  return 'No matching template.';
}

/**
 * @function has_context_doc
 * @description checks if a file or a prefixed '+' variant exists
 * @param {Object} app - Obsidian app instance
 * @param {string} folder_path - folder path of the current file
 * @param {string} name - name of the doc to check
 * @param {boolean} [retried=false] - internal recursion guard
 * @returns {string|boolean} returns doc name if found, otherwise false
 */
async function has_context_doc(app, folder_path, name, retried=false) {
  const candidate = `${folder_path}/${name}.md`;
  if (await file_exists(app, candidate)) {
    return name;
  } else {
    if (!retried) {
      return await has_context_doc(app, folder_path, `+${name}`, true);
    }
  }
  return false;
}

/**
 * @function has_context_group_doc
 * @description search for a parent folder doc or a '+parentFolder' doc
 * @param {Object} app - Obsidian app
 * @param {string} folder_path - path to the current file's folder
 * @returns {string|boolean} a path if found, otherwise false
 */
async function has_context_group_doc(app, folder_path) {
  // strip last segment
  let parent = folder_path.replace(/\/[^/]+$/, '');
  if (!parent) return false;

  // check if `parent.md` exists
  let candidate = `${parent}.md`;
  if (!(await file_exists(app, candidate))) {
    // if not found, check if `+parent.md` exists
    const folder_basename = parent.split('/').pop();
    candidate = `${parent.replace(folder_basename, '')}+${folder_basename}.md`;
    if (!await file_exists(app, candidate)) {
      return false;
    }
  }
  return candidate;
}

/**
 * @function include_file_section
 * @description returns the content of `file_path` from heading
 * @param {Object} app - Obsidian app instance
 * @param {string} file_path - full path to the file
 * @param {string} heading - the heading name to include
 * @returns {Promise<string>} the file content from heading onward
 */
async function include_file_section(app, file_path, heading) {
  const content = await read_file_content(app, file_path);
  if (!content) return '';
  const heading_regex = new RegExp(`(^#{1,}\\s+${escape_regex(heading)}.*)$`, 'm');
  const match = heading_regex.exec(content);
  if (!match) return '';

  const index_of_heading = content.indexOf(match[1]);
  if (index_of_heading < 0) return '';
  // extract from heading to end
  return content.substring(index_of_heading);
}

/**
 * @function remove_template_header
 * @description removes lines like '# template' or '## template' at the start
 * @param {string} str
 * @returns {string} string with the # template header removed
 */
function remove_template_header(str) {
  return str.replace(/^#+ template\s*/, '');
}

/**
 * @function read_file_content
 * @description reads the file content via Obsidian vault
 * @param {Object} app - the Obsidian app instance
 * @param {string} path - full or relative path
 * @returns {Promise<string>}
 */
async function read_file_content(app, path) {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) {
    console.log('File does not exist in vault:', path);
    return '';
  }
  return await app.vault.read(file);
}

/**
 * @function file_exists
 * @description checks if a file path exists in the vault
 * @param {Object} app - Obsidian app instance
 * @param {string} path
 * @returns {Promise<boolean>}
 */
async function file_exists(app, path) {
  const file = app.vault.getAbstractFileByPath(path);
  return !!file;
}

/**
 * @function get_file_name
 * @description returns the basename (no extension) of a file path
 * @param {string} file_path
 * @returns {string}
 */
function get_file_name(file_path) {
  const base = file_path.split('/').pop();
  return base.replace(/\.[^.]+$/, '');
}

/**
 * @function get_folder_of_path
 * @description returns the folder part of the file path, excluding trailing slash
 * @param {string} file_path
 * @returns {string}
 */
function get_folder_of_path(file_path) {
  const parts = file_path.split('/');
  parts.pop(); // remove file
  return parts.join('/');
}

/**
 * @function has_emoji
 * @description checks if a string contains any emoji, returns the first if found
 * @param {string} str
 * @returns {string|false}
 */
function has_emoji(str) {
  const match_emoji_regex = /(\p{Emoji})/gu;
  const found = str.match(match_emoji_regex);
  if (found) {
    return found[0];
  }
  return false;
}

/**
 * @function escape_regex
 * @description escapes special characters in a string so it can safely be used as a regex pattern
 * @param {string} str
 * @returns {string}
 */
function escape_regex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

