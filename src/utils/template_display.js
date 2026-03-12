import {
  parse_template_headings,
  resolve_template_folders,
} from '../collections/smart_templates.js';

const DEFAULT_DISPLAY_RIGHT = 'source';
const BUILT_IN_DISPLAY_RIGHT = 'default';
const SMART_TEMPLATE_FLAG_LABEL = 'frontmatter';

/**
 * @param {Array<any>} template_items
 * @returns {Array<{ label: string, template_item: any }>}
 */
export function dedupe_template_records(template_items = []) {
  const seen_keys = new Set();
  const records = [];

  for (const template_item of Array.isArray(template_items) ? template_items : []) {
    if (!template_item) continue;
    const template_key = get_template_key(template_item);
    if (!template_key || seen_keys.has(template_key)) continue;

    seen_keys.add(template_key);
    records.push({
      label: template_key,
      template_item,
    });
  }

  return records;
}

/**
 * @param {Array<{ label: string, template_item: any }>} template_records
 * @returns {Array<{ label: string, template_item: any }>}
 */
export function sort_template_records(template_records = []) {
  return [...(Array.isArray(template_records) ? template_records : [])]
    .filter((record) => record?.template_item)
    .sort((left, right) => {
      const left_label = String(left?.label || '').toLocaleLowerCase();
      const right_label = String(right?.label || '').toLocaleLowerCase();
      return left_label.localeCompare(right_label);
    })
  ;
}

/**
 * @param {object} modal
 * @param {any} template_item
 * @returns {string}
 */
export function get_template_display_right(modal, template_item) {
  return resolve_template_match_reason(modal, template_item);
}

/**
 * @param {any} template_item
 * @returns {string}
 */
function get_template_key(template_item) {
  if (typeof template_item?.key === 'string' && template_item.key.trim().length) {
    return template_item.key.trim();
  }
  if (typeof template_item?.data?.key === 'string' && template_item.data.key.trim().length) {
    return template_item.data.key.trim();
  }
  if (typeof template_item?.data?.source_key === 'string' && template_item.data.source_key.trim().length) {
    return template_item.data.source_key.trim();
  }
  return '';
}

/**
 * @param {object} modal
 * @param {any} template_item
 * @returns {string}
 */
function resolve_template_match_reason(modal, template_item) {
  if (template_item?.data?.built_in) {
    return BUILT_IN_DISPLAY_RIGHT;
  }

  const env = template_item?.env || modal?.env;
  const settings = env?.smart_templates?.settings || {};
  const source_key = get_template_source_key(template_item);
  const source_path = get_source_path(source_key);
  const source_heading = get_source_heading(source_key);
  const template_heading_candidates = get_template_heading_candidates(settings);

  if (source_heading && template_heading_candidates.includes(source_heading)) {
    return `heading: ${source_heading}`;
  }

  const default_folder = get_default_templates_folder(env);
  const template_folders = resolve_template_folders(settings, default_folder);
  const matching_folder = get_matching_folder(source_path, template_folders);
  if (matching_folder) {
    return `folder: ${matching_folder}`;
  }

  const normalized_template_name = normalize_template_name(settings?.template_name);
  if (normalized_template_name && source_path.endsWith(normalized_template_name)) {
    return `name: ${normalized_template_name}`;
  }

  if (template_item?.metadata?.['smart template']) {
    return SMART_TEMPLATE_FLAG_LABEL;
  }

  if (source_heading) {
    return `heading: ${source_heading}`;
  }

  return DEFAULT_DISPLAY_RIGHT;
}

/**
 * @param {any} template_item
 * @returns {string}
 */
function get_template_source_key(template_item) {
  const source_key = template_item?.data?.source_key;
  if (typeof source_key === 'string' && source_key.trim().length) {
    return source_key.trim();
  }
  return get_template_key(template_item);
}

/**
 * @param {string} source_key
 * @returns {string}
 */
function get_source_path(source_key = '') {
  if (typeof source_key !== 'string' || !source_key.length) return '';
  const hash_index = source_key.indexOf('#');
  return hash_index === -1 ? source_key : source_key.slice(0, hash_index);
}

/**
 * @param {string} source_key
 * @returns {string}
 */
function get_source_heading(source_key = '') {
  if (typeof source_key !== 'string' || !source_key.includes('#')) return '';
  const headings = source_key.split('#').slice(1).filter(Boolean);
  if (!headings.length) return '';
  return headings[headings.length - 1].trim();
}

/**
 * @param {object} settings
 * @returns {string[]}
 */
function get_template_heading_candidates(settings = {}) {
  const headings = new Set(parse_template_headings(settings));

  const legacy_template_heading = typeof settings?.template_heading === 'string'
    ? settings.template_heading
    : ''
  ;
  if (legacy_template_heading) {
    legacy_template_heading
      .split(',')
      .map((heading) => heading.trim())
      .filter(Boolean)
      .forEach((heading) => headings.add(heading))
    ;
  }

  return [...headings];
}

/**
 * @param {string} template_name
 * @returns {string}
 */
function normalize_template_name(template_name = '') {
  if (typeof template_name !== 'string') return '';
  const trimmed_name = template_name.trim();
  if (!trimmed_name) return '';
  if (trimmed_name.endsWith('.md')) return trimmed_name;
  return `${trimmed_name}.md`;
}

/**
 * @param {string} source_path
 * @param {string[]} template_folders
 * @returns {string}
 */
function get_matching_folder(source_path = '', template_folders = []) {
  if (!source_path || !Array.isArray(template_folders) || !template_folders.length) {
    return '';
  }

  const sorted_folders = [...template_folders]
    .map((folder) => folder.trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
  ;

  return sorted_folders.find((folder) => {
    if (source_path === folder) return true;
    return source_path.startsWith(`${folder}/`);
  }) || '';
}

/**
 * @param {object} env
 * @returns {string}
 */
function get_default_templates_folder(env) {
  return env?.plugin?.app?.internalPlugins?.plugins?.templates?.instance?.options?.folder || '';
}
