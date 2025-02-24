/**
 * @module get_dynamic_template
 * @description Retrieves a dynamic template based on the current file and settings.
 */

export async function get_dynamic_template(source_item, opts={}) {
  if (!source_item) {
    console.warn('get_dynamic_template: Missing source_item.');
    return 'No matching template.';
  }
  
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
 * @param {Object} opts
 * @param {Object} opts.fs - a smart_fs instance
 * @param {string} opts.start_folder - folder path to begin searching
 * @param {string} opts.file_name - name of the file to look for
 * @param {boolean} [opts.merge_parents=false] - if true, merges matches
 * @returns {Promise<string|null>} resolved content or null
 */
async function find_template_file(source_item, opts={}) {
  const env = source_item.env;
  const source_path = source_item.path;
  let curr_folder = opts.current_path ?? get_folder_path(source_path);
  if (!env) {
    console.warn('get_dynamic_template: source_item.env not found.');
    return 'No matching template.';
  }
  const settings = env.smart_templates?.settings || {};
  const template_name = (settings.template_name.endsWith('.md') ? settings.template_name : settings.template_name + '.md');
  console.log("template_name", template_name);
  const filter = {
    key_starts_with: curr_folder,
    key_ends_with: template_name,
  }
  const items = env.smart_sources.filter(filter);
  console.log("items", items);
  const merge_parents = settings.merge_parent_templates === true;
  console.log("merge_parents", merge_parents);
  if(merge_parents) {
    while(curr_folder !== '') {
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
    for(const item of items) {
      if(merged_content.length > 0) {
        merged_content += '\n\n';
      }
      merged_content += await item.read();
    }
    return merged_content;
  }else{
    if(items.length) {
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