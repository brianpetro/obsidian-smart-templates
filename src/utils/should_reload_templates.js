import { parse_template_headings } from '../collections/smart_templates.js';

/**
 * Decide whether a source lifecycle payload should trigger template reload.
 *
 * @param {import('../collections/smart_templates.js').SmartTemplates} smart_templates
 * @param {object} [params={}]
 * @param {object} [params.smart_sources]
 * @param {object} [params.payload]
 * @returns {boolean}
 */
export function should_reload_templates(smart_templates, params = {}) {
  const smart_sources = params.smart_sources || smart_templates?.env?.smart_sources;
  const payload = params.payload || {};

  const candidate_keys = [
    payload.item_key,
    payload.path,
    payload.new_path,
    payload.old_path,
    payload.from,
  ].filter((value) => typeof value === 'string' && value.length);

  if (!candidate_keys.length) return false;

  const template_matcher = smart_templates?.get_template_matcher?.();
  if (typeof template_matcher === 'function') {
    const has_direct_match = candidate_keys.some((candidate_key) => {
      const source_item = smart_sources?.get?.(candidate_key) || { key: candidate_key };
      return template_matcher(source_item);
    });
    if (has_direct_match) return true;
  }

  const template_headings = parse_template_headings(smart_templates?.settings || {});
  if (template_headings.length) {
    const has_markdown_like_key = candidate_keys.some((candidate_key) => {
      return /\.(md|txt)$/i.test(candidate_key);
    });
    if (has_markdown_like_key) return true;
  }

  return false;
}
