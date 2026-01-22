/**
 * Determine whether a template collection reload is needed for a source event.
 * @param {Object} smart_templates
 * @param {Object} [params={}]
 * @param {Object} [params.smart_sources]
 * @param {Object} [params.payload]
 * @param {string} [params.payload.path]
 * @param {string} [params.payload.item_key]
 * @param {string} [params.payload.old_path]
 * @returns {boolean}
 */
export function should_reload_templates(smart_templates, params = {}) {
  const template_matcher = smart_templates?.get_template_matcher?.();
  if (!template_matcher) return false;

  const payload = params.payload || {};
  const smart_sources = params.smart_sources;
  const source_key = payload?.path || payload?.item_key;
  const source_item = source_key ? smart_sources?.get?.(source_key) : null;

  if (source_item && template_matcher(source_item)) return true;

  const candidate_keys = [source_key, payload?.old_path].filter(Boolean);
  if (!candidate_keys.length) return false;

  return candidate_keys.some((key) => template_matcher({ key }));
}
