/**
 * Normalize a template label for display and dedupe.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalize_template_label(value = '') {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  ;
}

/**
 * Resolve the best display label for a template item.
 *
 * Fallback order:
 *  1. template.key
 *  2. template.data.key
 *  3. template.data.source_key
 *  4. template.metadata.title
 *
 * @param {object} template_item
 * @returns {string}
 */
export function resolve_template_label(template_item) {
  if (!template_item || typeof template_item !== 'object') {
    return '';
  }

  const candidate_labels = [
    template_item.key,
    template_item?.data?.key,
    template_item?.data?.source_key,
    template_item?.metadata?.title,
  ];

  for (const candidate_label of candidate_labels) {
    const normalized_label = normalize_template_label(candidate_label);
    if (normalized_label) {
      return normalized_label;
    }
  }

  return '';
}

/**
 * Dedupe template items by normalized label, preserving first seen.
 *
 * @param {object[]} template_items
 * @returns {Array<{ label: string, template_item: object }>}
 */
export function dedupe_template_records(template_items = []) {
  const seen_labels = new Set();
  const deduped_records = [];

  for (const template_item of template_items) {
    const label = resolve_template_label(template_item);
    if (!label) continue;

    const dedupe_key = label.toLocaleLowerCase();
    if (seen_labels.has(dedupe_key)) continue;

    seen_labels.add(dedupe_key);
    deduped_records.push({ label, template_item });
  }

  return deduped_records;
}

/**
 * Sort template records alphabetically by label.
 *
 * @param {Array<{ label: string, template_item: object }>} template_records
 * @returns {Array<{ label: string, template_item: object }>}
 */
export function sort_template_records(template_records = []) {
  return [...template_records].sort((left_record, right_record) => {
    const left_label = String(left_record?.label || '').toLocaleLowerCase();
    const right_label = String(right_record?.label || '').toLocaleLowerCase();
    return left_label.localeCompare(right_label);
  });
}

/**
 * Build right-side display metadata for a template suggestion row.
 *
 * @param {object} modal
 * @param {object} template_item
 * @returns {string}
 */
export function get_template_display_right(modal, template_item) {
  const display_parts = [];

  if (modal?.selected_template_key && modal.selected_template_key === template_item?.key) {
    display_parts.push('selected');
  }

  if (template_item?.data?.source_key) {
    display_parts.push('source');
  } else if (template_item?.data?.content) {
    display_parts.push('inline');
  }

  return display_parts.join(' | ');
}
