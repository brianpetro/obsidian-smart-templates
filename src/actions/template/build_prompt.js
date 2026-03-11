import { build_prompt_text } from '../../utils/build_prompt_text.js';

/**
 * Build a single prompt string from the template item and a SmartContext.
 *
 * @this {import('../../items/smart_template.js').SmartTemplate}
 * @param {object} [params={}]
 * @param {import('smart-contexts').SmartContext} [params.ctx]
 * @param {string} [params.ctx_key]
 * @param {string} [params.user_message]
 * @param {string} [params.instructions]
 * @returns {Promise<string>}
 */
export async function template_build_prompt(params = {}) {
  const ctx = resolve_ctx(this, params);
  if (!ctx) {
    throw new Error('template_build_prompt requires params.ctx or params.ctx_key');
  }

  const user_message = typeof params.user_message === 'string'
    ? params.user_message
    : typeof params.instructions === 'string'
      ? params.instructions
      : ''
  ;

  return await build_prompt_text(ctx, this, user_message);
}

function resolve_ctx(template_item, params = {}) {
  if (params.ctx) return params.ctx;
  if (typeof params.ctx_key === 'string' && params.ctx_key) {
    return template_item?.env?.smart_contexts?.get?.(params.ctx_key) || null;
  }
  return null;
}
