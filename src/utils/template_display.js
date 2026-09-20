import {
  parse_template_headings,
  resolve_template_folders,
} from './template_discovery.js';

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
      label: get_template_name(template_item),
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
  return [...template_records].filter((record) => record?.template_item).sort((left, right) => {
    const left_suggested = is_suggested_template(left.template_item);
    const right_suggested = is_suggested_template(right.template_item);
    if (left_suggested !== right_suggested) return left_suggested ? 1 : -1;
    // Derived snapshot insertion order is the configured inference ranking.
    if (left_suggested) return 0;
    return left.label.localeCompare(right.label) || left.template_item.key.localeCompare(right.template_item.key);
  });
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
  if (is_suggested_template(template_item)) return 'inferred | ' + get_template_support(template_item);
  if (template_item?.data?.provenance?.origin === 'derived_headings') return 'confirmed inferred template';
  if (!template_item?.data?.source_key && !template_item?.data?.built_in) return 'confirmed inline template';
  if (template_item?.data?.built_in) {
    return BUILT_IN_DISPLAY_RIGHT;
  }

  const env = template_item?.env || modal?.env;
  const discovery = env?.smart_templates?.get_discovery_state?.(modal?.params || {});
  if (discovery?.adapter_key === 'bases' && template_item?.data?.source_key) {
    return `Base: ${discovery.view_name || discovery.base_key || 'configured scope'}`;
  }
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

/** Only this existing transient ownership contract represents a suggestion. */
export function is_suggested_template(item) {
  return item?.data?.transient === true && item.data.provider_key === 'derived_headings';
}

/** Readable labels without fetching content or interpreting synthetic keys. */
export function get_template_name(item) {
  if (typeof item?.data?.name === 'string' && item.data.name.trim()) return item.data.name.trim();
  if (item?.data?.built_in) return get_template_key(item).replace(/ \(default\)$/i, '');
  const source_key = item?.data?.source_key;
  if (source_key) {
    const [path, ...headings] = source_key.split('#');
    const name = path.split('/').pop().replace(/\.(md|txt)$/i, '');
    return headings.filter(Boolean).length ? `${name} / ${headings.filter(Boolean).join(' / ')}` : name;
  }
  const headings = String(item?.data?.content || '').split(/\r?\n/)
    .map((line) => line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/)?.[1]).filter(Boolean);
  if (headings.length) return headings.slice(0, 3).join(' / ') + (headings.length > 3 ? ` + ${headings.length - 3} more` : '');
  return get_template_key(item);
}

export function get_template_support(item) {
  const provenance = item?.data?.provenance;
  if (!Number.isInteger(provenance?.support)) return 'Support not recorded';
  const coverage = Number.isFinite(provenance.coverage) ? ` (${Math.round(provenance.coverage * 100)}% of eligible sources)` : '';
  return `${provenance.support} supporting sources${coverage}`;
}

export function get_template_origin(item) {
  if (item.data.built_in) return 'Built-in';
  if (item.data.source_key) return 'Vault';
  if (is_suggested_template(item)) return 'Suggested';
  return item.data.provenance?.origin === 'derived_headings' ? 'Confirmed inferred' : 'Confirmed inline';
}

/** Presentation groups preserve the collection's membership and inferred order. */
export function get_template_groups(items, query = '') {
  const groups = new Map([
    ['Vault', { title: 'Vault templates', section: 'Available', records: [] }],
    ['Confirmed inferred', { title: 'Confirmed inferred templates', section: 'Available', records: [] }],
    ['Confirmed inline', { title: 'Inline templates', section: 'Available', records: [] }],
    ['Built-in', { title: 'Built-in templates', section: 'Available', records: [] }],
    ['Suggested', { title: 'Inferred headings', section: 'Suggested', records: [] }],
  ]);
  const search = query.trim().toLowerCase();
  for (const record of sort_template_records(dedupe_template_records(items))) {
    const item = record.template_item;
    const description = typeof item.data.description === 'string' ? item.data.description : '';
    if (search && !`${record.label} ${item.key} ${item.data.source_key || ''} ${description}`.toLowerCase().includes(search)) continue;
    groups.get(get_template_origin(item)).records.push(record);
  }
  return [...groups.values()].filter((group) => group.records.length);
}
