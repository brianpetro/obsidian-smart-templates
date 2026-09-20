/** Pure legacy template detection helpers. No collection or host imports. */

/**
 * Normalize a template folder so folder matching respects path boundaries.
 *
 * @param {string} folder
 * @returns {string}
 */
function normalize_template_folder(folder = '') {
  return String(folder || '').trim().replace(/\/+$/g, '');
}

/**
 * Resolve the path portion of a source or block key.
 *
 * @param {string} source_key
 * @returns {string}
 */
function get_source_path(source_key = '') {
  const normalized_source_key = String(source_key || '').trim();
  if (!normalized_source_key) return '';
  const hash_index = normalized_source_key.indexOf('#');
  return hash_index === -1
    ? normalized_source_key
    : normalized_source_key.slice(0, hash_index)
  ;
}

/**
 * Parse a comma-separated headings string from settings into a unique array.
 *
 * @param {object} settings
 * @returns {string[]}
 */
export function parse_template_headings(settings = {}) {
  if (!settings || typeof settings.template_headings !== 'string') return [];
  const headings = settings.template_headings
    .split(',')
    .map((heading) => heading.trim())
    .filter(Boolean)
  ;
  return Array.from(new Set(headings));
}

/**
 * Stringify a list of headings into comma-separated format for settings.
 *
 * @param {string[]} headings
 * @returns {string}
 */
export function stringify_template_headings(headings = []) {
  if (!Array.isArray(headings)) return '';
  return headings
    .map((heading) => (typeof heading === 'string' ? heading.trim() : ''))
    .filter(Boolean)
    .join(', ')
  ;
}

/**
 * Parse a comma-separated folder string from settings into a sorted unique array.
 *
 * @param {object} settings
 * @returns {string[]}
 */
export function parse_template_folders(settings = {}) {
  if (!settings) return [];
  const folders = Array.isArray(settings.template_folder)
    ? settings.template_folder
    : typeof settings.template_folder === 'string'
      ? settings.template_folder.split(',')
      : []
  ;

  return Array.from(
    new Set(
      folders
        .map((folder) => normalize_template_folder(folder))
        .filter(Boolean),
    ),
  ).sort();
}

/**
 * Stringify a list of folders into comma-separated format for settings.
 *
 * @param {string[]} folders
 * @returns {string}
 */
export function stringify_template_folders(folders = []) {
  if (!Array.isArray(folders)) return '';
  return folders
    .map((folder) => normalize_template_folder(folder))
    .filter(Boolean)
    .join(', ')
  ;
}

/**
 * Resolve template folders from settings or default folder.
 *
 * @param {object} [settings={}]
 * @param {string} [default_folder='']
 * @returns {string[]}
 */
export function resolve_template_folders(settings = {}, default_folder = '') {
  const template_folders = parse_template_folders(settings);
  if (template_folders.length) return template_folders;
  const normalized_default_folder = normalize_template_folder(default_folder);
  if (normalized_default_folder) return [normalized_default_folder];
  return [];
}

/**
 * Build a predicate that matches Smart Template sources.
 *
 * @param {object} params
 * @param {string[]} [params.template_folders=[]]
 * @param {string} [params.template_name='']
 * @param {string[]} [params.template_headings=[]]
 * @returns {(source_item: { key?: string, data?: { key?: string }, metadata?: object }) => boolean}
 */
export function build_template_matcher({
  template_folders = [],
  template_name = '',
  template_headings = [],
} = {}) {
  let normalized_name = template_name;
  if (normalized_name && !normalized_name.endsWith('.md')) {
    normalized_name += '.md';
  }

  const normalized_headings = Array.isArray(template_headings)
    ? template_headings.map((heading) => heading.trim()).filter(Boolean)
    : []
  ;
  const normalized_folders = Array.isArray(template_folders)
    ? template_folders
      .map((folder) => normalize_template_folder(folder))
      .filter(Boolean)
    : []
  ;

  const is_smart_template_flag_enabled = (source_item = {}) => {
    return !!source_item?.metadata?.['smart template'];
  };

  return (source_item = {}) => {
    const source_key = source_item?.key || source_item?.data?.key;
    if (!source_key) return false;

    const source_path = get_source_path(source_key);

    if (
      normalized_folders.length &&
      normalized_folders.some((folder) => {
        if (source_path === folder) return true;
        return source_path.startsWith(`${folder}/`);
      })
    ) {
      return true;
    }

    if (normalized_name && source_path.endsWith(normalized_name)) {
      return true;
    }

    if (is_smart_template_flag_enabled(source_item)) {
      return true;
    }

    if (
      normalized_headings.length &&
      normalized_headings.some((heading) => source_key.endsWith(`#${heading}`))
    ) {
      return true;
    }

    return false;
  };
}

/**
 * Collect unique folder candidates from smart source keys.
 *
 * @param {Array<{ key?: string }>} sources
 * @returns {string[]}
 */
export function collect_template_folder_candidates(sources = []) {
  if (!Array.isArray(sources)) return [];
  const folders = new Set();

  sources.forEach((source) => {
    const key = source?.key || source?.data?.key;
    if (!key) return;
    const source_path = get_source_path(key);
    const last_slash_index = source_path.lastIndexOf('/');
    if (last_slash_index === -1) return;
    const folder = source_path.slice(0, last_slash_index);
    if (folder) folders.add(folder);
  });

  return Array.from(folders).sort();
}

/**
 * Collect unique heading candidates from smart block keys.
 *
 * @param {Array<{ key?: string }>} blocks
 * @returns {string[]}
 */
export function collect_block_heading_candidates(blocks = []) {
  if (!Array.isArray(blocks)) return [];
  const headings = new Set();

  blocks.forEach((block) => {
    const key = block?.key || block?.data?.key;
    if (!key) return;
    const hash_index = key.lastIndexOf('#');
    if (hash_index === -1 || hash_index === key.length - 1) return;
    const heading = key.slice(hash_index + 1);
    if (heading) headings.add(heading);
  });

  return Array.from(headings).sort();
}

/**
 * Filter blocks that end with any of the provided headings.
 *
 * @param {Array<{ key?: string }>} blocks
 * @param {string[]} headings
 * @returns {Array<{ key?: string }>}
 */
export function filter_blocks_by_headings(blocks = [], headings = []) {
  if (!Array.isArray(blocks) || !Array.isArray(headings) || !headings.length) return [];
  const trimmed_headings = headings.map((heading) => heading.trim()).filter(Boolean);
  if (!trimmed_headings.length) return [];

  return blocks.filter((block) => {
    const key = block?.key || block?.data?.key;
    if (!key) return false;
    return trimmed_headings.some((heading) => key.endsWith(`#${heading}`));
  });
}

