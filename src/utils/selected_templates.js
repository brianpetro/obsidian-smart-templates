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
  const candidate_values = [
    ...(Array.isArray(selected_template_keys) ? selected_template_keys : [selected_template_keys]),
    ...(Array.isArray(fallback_template_key) ? fallback_template_key : [fallback_template_key]),
  ];

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
 * @param {import('../items/smart_template.js').SmartTemplate|null} [fallback_template_item=null]
 * @returns {Array<import('../items/smart_template.js').SmartTemplate>}
 */
export function get_selected_template_items(
  env,
  params = {},
  fallback_template_item = null,
) {
  const fallback_key = fallback_template_item?.key || params?.selected_template_key || null;
  const template_keys = normalize_selected_template_keys(
    params?.selected_template_keys,
    fallback_key,
  );

  const template_items = template_keys
    .map((template_key) => {
      if (fallback_template_item?.key === template_key) return fallback_template_item;
      return env?.smart_templates?.get?.(template_key) || null;
    })
    .filter(Boolean)
  ;

  if (!template_items.length && fallback_template_item) {
    return [fallback_template_item];
  }

  return template_items;
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
 * Resolve either the original template item or a merged template proxy.
 *
 * @param {import('../items/smart_template.js').SmartTemplate} fallback_template_item
 * @param {object} [params={}]
 * @returns {Promise<import('../items/smart_template.js').SmartTemplate|{ key: string, data: object, metadata: object, get_template: () => Promise<string> }|null>}
 */
export async function resolve_request_template(fallback_template_item, params = {}) {
  const env = fallback_template_item?.env;
  const template_items = get_selected_template_items(env, params, fallback_template_item);
  if (!template_items.length) return null;
  if (template_items.length === 1) return template_items[0];

  const merged_template_text = await get_merged_template_text(template_items);
  const merged_template_key = template_items
    .map((template_item) => template_item.key)
    .join(' + ')
  ;

  return {
    env,
    key: merged_template_key,
    data: {
      built_in: template_items.every((template_item) => template_item?.data?.built_in === true),
      merged: true,
      selected_template_keys: template_items.map((template_item) => template_item.key),
    },
    metadata: {},
    async get_template() {
      return merged_template_text;
    },
  };
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
    .map((template_item) => String(template_item?.key || '').trim())
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
    return normalized_items[0]?.data?.built_in === true
      ? 'Built-in template'
      : 'Vault template'
    ;
  }

  const built_in_count = normalized_items
    .filter((template_item) => template_item?.data?.built_in === true)
    .length
  ;
  const vault_count = normalized_items.length - built_in_count;

  const type_segments = [];
  if (built_in_count > 0) {
    type_segments.push(`${built_in_count} built-in`);
  }
  if (vault_count > 0) {
    type_segments.push(`${vault_count} vault`);
  }

  const base_label = `${normalized_items.length} templates selected`;
  if (!type_segments.length) return base_label;
  return `${base_label} - ${type_segments.join(', ')}`;
}
