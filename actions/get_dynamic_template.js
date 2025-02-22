/**
 * @module get_dynamic_template
 * @description Retrieves a dynamic template based on the current file's content and folder hierarchy.
 *
 * This function implements the logic described in the specs:
 * 1) If `env.smart_templates.settings.template_heading` is set, attempts to find an intra-note heading
 *    in the current file's content matching that heading. If found, returns all subsequent content
 *    (excluding the heading line itself).
 * 2) If no intra-note heading is found (or the setting is not set), searches upward for a file named
 *    `{{template_heading}}.md` in the same or any parent folder. If found, returns that file's content.
 * 3) If still not found, optionally checks for a `+template.md` file in the folder (if desired by specs).
 * 4) If none of the above yield a template, return "No matching template."
 *
 * Note: Adjust the search strategy as needed (e.g. for `+template.md` or other fallback logic).
 *
 * @example
 * import { get_dynamic_template } from './get_dynamic_template.js';
 * const content = await get_dynamic_template({
 *   source_item: someSourceItem,
 *   env: yourSmartEnvInstance
 * });
 * console.log(content);
 *
 * @param {Object} opts
 * @param {Object} opts.source_item - A Source CollectionItem (with .path and .collection.fs)
 * @param {Object} opts.env - The environment object (expects env.smart_templates and env.smart_sources)
 * @returns {Promise<string>} Resolves to the template content if found, otherwise "No matching template."
 */
export async function get_dynamic_template({ source_item, env }) {
  if (!source_item || !env) {
    console.warn('get_dynamic_template: Missing source_item or env. Returning no match.');
    return 'No matching template.';
  }

  const fs = source_item.collection.fs; // The smart_fs instance
  const file_path = source_item.path;
  const folder_path = get_folder_path(file_path);

  // 1) If a template_heading setting is provided, try to extract from current file content
  const template_heading = env.smart_templates?.settings?.template_heading;
  if (template_heading) {
    // Attempt to find the heading in the current file's content
    try {
      const current_content = await fs.read(file_path, 'utf-8');
      const heading_content = extract_heading_content(current_content, template_heading);
      if (heading_content) {
        // Found the heading and its subsequent content
        return heading_content;
      }
    } catch (err) {
      console.warn(`Error reading current file for heading ${template_heading}:`, err);
    }

    // 2) If not found in current file, search upward for a file named "{{template_heading}}.md"
    const upward_content = await find_upward_named_template(fs, folder_path, `${template_heading}.md`);
    if (upward_content) return upward_content;
  }

  // 3) Optionally search for a "+template.md" in the folder or parent folders (uncomment if needed):
  // const plus_template_content = await find_upward_named_template(fs, folder_path, '+template.md');
  // if (plus_template_content) return plus_template_content;

  // If no match was found
  return 'No matching template.';
}

/**
 * @function extract_heading_content
 * @description Looks for a heading in 'fileContent' matching 'headingName' (case-insensitive).
 *              If found, returns all subsequent lines until the next heading or end of file.
 * @param {string} fileContent
 * @param {string} headingName
 * @returns {string|null} The extracted content or null if not found.
 */
function extract_heading_content(fileContent, headingName) {
  // Convert to lines
  const lines = fileContent.split('\n');
  // A heading might appear as:  "# headingName" or "## headingName" etc.
  // We do a case-insensitive match for the heading name
  const headingRegex = new RegExp(`^#{1,6}\\s+${escape_regex(headingName)}\\s*$`, 'i');

  // Find the line index of the heading
  let startIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingRegex.test(lines[i].trim())) {
      startIndex = i;
      break;
    }
  }
  if (startIndex < 0) return null;

  // Collect subsequent lines until next heading or end of file
  let resultLines = [];
  for (let j = startIndex + 1; j < lines.length; j++) {
    // check if next line is another heading
    if (/^#{1,6}\s+/.test(lines[j].trim())) {
      break;
    }
    resultLines.push(lines[j]);
  }

  const extracted = resultLines.join('\n').trim();
  return extracted.length ? extracted : null;
}

/**
 * @function find_upward_named_template
 * @description Searches the current and parent folders for a file named 'templateFileName'.
 *              Returns file content if found, otherwise null.
 * @param {Object} fs - A smart_fs instance
 * @param {string} folder_path - Current folder path
 * @param {string} templateFileName - The file name to look for (e.g. "Meeting.md", "+template.md")
 * @returns {Promise<string|null>}
 */
async function find_upward_named_template(fs, folder_path, templateFileName) {
  let currentFolder = folder_path;
  while (true) {
    const candidatePath = currentFolder ? `${currentFolder}/${templateFileName}` : templateFileName;
    if (await fs.exists(candidatePath)) {
      // Read and return the content
      try {
        return await fs.read(candidatePath, 'utf-8');
      } catch (err) {
        console.warn(`Error reading ${candidatePath}:`, err);
        return null;
      }
    }
    // Move one folder up
    const parentFolder = parent_of_folder(currentFolder);
    if (!parentFolder || parentFolder === currentFolder) {
      break; // Reached top
    }
    currentFolder = parentFolder;
  }
  return null;
}

/**
 * @function get_folder_path
 * @description Splits off the last segment of a file path to get the folder portion.
 * @param {string} filePath
 * @returns {string} The folder path (may be empty string if none).
 */
function get_folder_path(filePath) {
  if (!filePath.includes('/')) return '';
  const parts = filePath.split('/');
  parts.pop(); // remove file name
  return parts.join('/');
}

/**
 * @function parent_of_folder
 * @description Returns the parent folder of 'folderPath'. If already top-level or empty, returns ''.
 * @param {string} folderPath
 * @returns {string}
 */
function parent_of_folder(folderPath) {
  if (!folderPath.includes('/')) return '';
  const parts = folderPath.split('/');
  parts.pop();
  return parts.join('/');
}

/**
 * @function escape_regex
 * @description Escapes special regex characters in a string.
 * @param {string} str
 * @returns {string}
 */
function escape_regex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
