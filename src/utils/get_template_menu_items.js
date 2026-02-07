/**
 * @typedef {Object} TemplateMenuItem
 * @property {string} label
 * @property {import('../items/smart_template.js').SmartTemplate} template_item
 */

/**
 * @param {Array<import('../items/smart_template.js').SmartTemplate | null | undefined>} template_items
 * @returns {TemplateMenuItem[]}
 */
export function get_template_menu_items(template_items = []) {
  const unique_items = template_items.reduce((acc, template_item) => {
    if (!template_item) return acc;
    const label = get_template_label(template_item);
    if (!label || acc.seen_labels.has(label)) return acc;
    acc.seen_labels.add(label);
    acc.items.push({ label, template_item });
    return acc;
  }, { seen_labels: new Set(), items: [] });

  return unique_items.items.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * @param {import('../items/smart_template.js').SmartTemplate} template_item
 * @returns {string}
 */
function get_template_label(template_item) {
  const label = template_item?.key
    || template_item?.data?.key
    || template_item?.data?.source_key
    || '';
  return String(label).trim();
}
