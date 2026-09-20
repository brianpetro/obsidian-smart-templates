import { get_template_name, get_template_origin } from './template_display.js';

/**
 * Helpers for resolving, formatting, and merging selected Smart Templates.
 */

/**
 * Normalize a list of selected template keys while preserving order.
 *
 * @param {string[]|string|null|undefined} selected_template_keys
 * @param {string|string[]|null|undefined} [fallback_template_key]
 * @returns {string[]}
 */
export function normalize_selected_template_keys(
  selected_template_keys,
  fallback_template_key = null,
) {
  // Fallback is for omission only, never for an explicitly empty selection.
  const selected_values = selected_template_keys == null
    ? fallback_template_key
    : selected_template_keys
  ;
  const candidate_values = Array.isArray(selected_values) ? selected_values : [selected_values];

  const seen = new Set();
  return candidate_values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

/**
 * Resolve selected template items from env.smart_templates.
 *
 * @param {object} env
 * @param {object} [params={}]
 * @param {string[]} [params.selected_template_keys]
 * @param {string} [params.selected_template_key]
 * @param {boolean} [params.strict=false] Reject unresolved execution inputs.
 * @param {import('../items/smart_template.js').SmartTemplate|null} [fallback_template_item=null]
 * @returns {Array<import('../items/smart_template.js').SmartTemplate>}
 */
export function get_selected_template_items(
  env,
  params = {},
  fallback_template_item = null,
) {
  const fallback_key = params?.selected_template_key || fallback_template_item?.key || null;
  if (params.strict && params.selected_template_keys != null) {
    const values = Array.isArray(params.selected_template_keys)
      ? params.selected_template_keys : [params.selected_template_keys];
    if (values.some((value) => typeof value !== 'string' || !value.trim())) {
      throw new TypeError('Selected template keys must be non-empty strings.');
    }
  }
  const template_keys = normalize_selected_template_keys(
    params?.selected_template_keys,
    fallback_key,
  );

  return template_keys.map((template_key) => {
    const template_item = env?.smart_templates
      ? env.smart_templates.get(template_key)
      : (fallback_template_item?.key === template_key ? fallback_template_item : null)
    ;
    if (!template_item || template_item.deleted) {
      if (params.strict) throw new Error(`Selected template unavailable: ${template_key}`);
      return null;
    }
    return template_item;
  }).filter(Boolean);
}

/**
 * Merge selected template text in stable selection order.
 *
 * @param {Array<import('../items/smart_template.js').SmartTemplate>} template_items
 * @param {object} [params={}]
 * @param {string} [params.separator='\n\n']
 * @returns {Promise<string>}
 */
export async function get_merged_template_text(template_items, params = {}) {
  const separator = typeof params.separator === 'string'
    ? params.separator
    : '\n\n'
  ;

  const template_segments = [];
  for (const template_item of Array.isArray(template_items) ? template_items : []) {
    const template_text = await template_item?.get_template?.();
    const normalized_text = typeof template_text === 'string'
      ? template_text.trim()
      : ''
    ;
    if (!normalized_text) continue;
    template_segments.push(normalized_text);
  }

  return template_segments.join(separator);
}

/**
 * Format the selected template label for the request panel.
 *
 * @param {Array<import('../items/smart_template.js').SmartTemplate>} template_items
 * @param {object} [params={}]
 * @param {number} [params.max_visible=2]
 * @returns {string}
 */
export function format_selected_templates_label(template_items, params = {}) {
  const normalized_items = Array.isArray(template_items) ? template_items.filter(Boolean) : [];
  if (!normalized_items.length) return 'No template selected';

  const max_visible = Number.isFinite(params.max_visible)
    ? params.max_visible
    : 2
  ;

  const labels = normalized_items
    .map((template_item) => get_template_name(template_item))
    .filter(Boolean)
  ;

  if (!labels.length) return 'No template selected';
  if (labels.length <= max_visible) return labels.join(' + ');

  const visible_labels = labels.slice(0, max_visible);
  const remaining_count = labels.length - visible_labels.length;
  return `${visible_labels.join(' + ')} + ${remaining_count} more`;
}

/**
 * Format the selected template metadata for the request panel.
 *
 * @param {Array<import('../items/smart_template.js').SmartTemplate>} template_items
 * @returns {string}
 */
export function format_selected_templates_meta(template_items) {
  const normalized_items = Array.isArray(template_items) ? template_items.filter(Boolean) : [];
  if (!normalized_items.length) {
    return 'Choose one or more built-in or vault templates';
  }

  if (normalized_items.length === 1) {
    return `${get_template_origin(normalized_items[0])} template`;
  }

  const built_in_count = normalized_items
    .filter((template_item) => template_item?.data?.built_in === true)
    .length
  ;
  const vault_count = normalized_items.filter((item) => item.data?.source_key).length;
  const inline_count = normalized_items.length - built_in_count - vault_count;

  const type_segments = [];
  if (built_in_count > 0) {
    type_segments.push(`${built_in_count} built-in`);
  }
  if (vault_count > 0) {
    type_segments.push(`${vault_count} vault`);
  }

  if (inline_count > 0) type_segments.push(`${inline_count} inline`);
  const base_label = `${normalized_items.length} templates selected`;
  if (!type_segments.length) return base_label;
  return `${base_label} - ${type_segments.join(', ')}`;
}

/** Validate a native handoff without changing its ordered explicit selection. */
export function require_visible_templates(collection, keys, params = {}) {
  const items = get_selected_template_items(collection.env, { selected_template_keys: keys, strict: true });
  const visible = new Set(collection.get_visible_templates(params));
  for (const item of items) {
    if (!visible.has(item)) throw new Error(`Template is outside the current discovery scope: ${item.key}`);
  }
  return items;
}
