/**
 * @module get_dynamic_templates
 * @description
 * Collects a list of template items (SmartTemplate instances) relevant to the
 * current file, based on folder hierarchy and settings.
 *
 * Each returned SmartTemplate item can be read independently to retrieve
 * the final content (see smart_template.get_template()).
 */

import { extract_heading_from_string } from './extract_heading_from_string.js';

/**
 * @function get_dynamic_templates
 * @param {Object} source_item - The current source item representing the active file.
 * @param {Object} [opts={}]
 * @returns {Promise<Array>} An array of SmartTemplate items. May be empty if none found.
 */
export async function get_dynamic_templates(source_item, opts = {}) {
  if (!source_item) {
    console.warn('get_dynamic_templates: Missing source_item.');
    return [];
  }
  const env = source_item.env;
  if (!env) {
    console.warn('get_dynamic_templates: source_item.env not found.');
    return [];
  }

  const settings = env.smart_templates?.settings || {};
  const results = [];

  // 1) If the user specified a template heading, create an intra-note template item
  //    representing the content under that heading in the current note.
  if (settings.template_heading) {
    const source_content = await source_item.read();
    if(source_content.includes(settings.template_heading)) {
      const template_content = extract_heading_from_string(source_content, settings.template_heading);
      results.push(template_content);
    }
  }

  // 2) Retrieve folder-level templates
  //    If merge_parent_templates => gather from current folder up to root
  //    else => get single best match
  if (settings.template_name) {
    if (settings.merge_parent_templates) {
      const folderTemplates = await collect_all_folder_templates(source_item, env, settings);
      results.push(...folderTemplates);
    } else {
      const singleFileTemplate = await find_best_folder_template(source_item, env, settings);
      if (singleFileTemplate) results.push(singleFileTemplate);
    }
  }

  // Return array of SmartTemplate items. 
  // Each item will handle extraction (heading filtering or system prompt removal) in .read().
  results.sort((a, b) => {
    if (typeof a === 'string') return 1;
    if (typeof b === 'string') return -1;
    return 0;
  });
  return results;
}

/**
 * @function collect_all_folder_templates
 * @description Gathers all folder-level template items from the source folder up to the root.
 * Ordered from child-most folder to root-most, so the caller can do e.g. 'concat_templates'
 * if they want them concatenated in that sequence.
 * @param {Object} source_item
 * @param {Object} env
 * @param {Object} settings
 * @returns {Promise<Array>} Array of SmartTemplate items
 */
async function collect_all_folder_templates(source_item, env, settings) {
  const results = [];
  const fs = env.smart_sources?.fs || env.data_fs;
  let folderPath = get_folder_path(source_item.path);
  const templateFileName = append_md_ext(settings.template_name);

  while (true) {
    // 1) Always compute templatePath for the current folderPath
    let template_key = folderPath
      ? folderPath + '/' + templateFileName
      : templateFileName
    ;
    if(!template_key.endsWith('.md')) {
      template_key += '.md';
    }

    console.log('collect_all_folder_templates', template_key);
    // 2) Attempt to find that template
    const tItem = env.smart_templates.get(template_key);
    if (tItem) {
      results.push(tItem);
    }
    console.log('collect_all_folder_templates results', results);

    // 3) Now decide if we can go up one level
    if (!folderPath) {
      // we just did the root, so stop
      break;
    }
    const newPath = get_folder_path(folderPath);
    if (newPath === folderPath) {
      // can't go up further
      break;
    }
    folderPath = newPath;
  }

  // Reverse results so that deeper folder is first, then parent, etc.
  results.sort((a, b) => b.data.source_key.length - a.data.source_key.length);
  return results;
}

/**
 * @function find_best_folder_template
 * @description Finds the single best match for a folder-level template for the source_item's folder
 * (or a parent), picking the deepest match (longest path).
 * @param {Object} source_item
 * @param {Object} env
 * @param {Object} settings
 * @returns {Promise<Object|null>} A SmartTemplate item or null if none
 */
async function find_best_folder_template(source_item, env, settings) {
  const templateFileName = append_md_ext(settings.template_name);
  const folderPath = get_folder_path(source_item.path);

  // Filter potential matches
  const possibleMatches = env.smart_sources.filter(i => {
    return i.path.endsWith('/' + templateFileName) || i.path === templateFileName;
  });
  if (!possibleMatches.length) return null;

  // Sort by path length descending to pick the "deepest" match
  possibleMatches.sort((a, b) => b.path.length - a.path.length);

  // Return first that actually belongs to same or parent folder
  // e.g. 'folder/subfolder/folder_template.md' vs 'folder_template.md' 
  const item = possibleMatches.find(m => {
    // check if m is in the same or parent folder as source_item
    return folderPath.startsWith(get_folder_path(m.path));
  });

  if (!item) return null;

  const templateKey = 'smart_template:' + item.path;
  let existingTemplate = env.smart_templates.get(templateKey);
  if (!existingTemplate) {
    existingTemplate = await env.smart_templates.create_or_update({
      key: templateKey,
      source_key: item.path
    });
  }
  return existingTemplate;
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
 * @function append_md_ext
 * @description Appends ".md" if not already present
 * @param {string} base
 * @returns {string}
 */
function append_md_ext(base) {
  if (base.endsWith('.md')) return base;
  return base + '.md';
}
