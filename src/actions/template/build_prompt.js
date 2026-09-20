import { build_prompt_text, get_vault_tags } from '../../utils/build_prompt_text.js';
import { get_selected_template_items, get_merged_template_text } from '../../utils/selected_templates.js';

/**
 * Build a single prompt string from the selected template(s) and a SmartContext.
 *
 * @this {import('../../items/smart_template.js').SmartTemplate}
 * @param {object} [params={}]
 * @param {import('smart-contexts').SmartContext} [params.ctx]
 * @param {string} [params.ctx_key]
 * @param {string} [params.user_message]
 * @param {string} [params.instructions]
 * @param {string[]} [params.selected_template_keys]
 * @returns {Promise<string>}
 */
export async function template_build_prompt(params = {}) {
  const ctx = resolve_ctx(this, params);
  if (!ctx) {
    throw new Error('template_build_prompt requires params.ctx or params.ctx_key');
  }

  const template_items = get_selected_template_items(this.env, { ...params, strict: true }, this);
  if (!template_items.length) {
    throw new Error('template_build_prompt requires at least one selected template');
  }

  const user_message = typeof params.user_message === 'string'
    ? params.user_message
    : typeof params.instructions === 'string'
      ? params.instructions
      : ''
  ;

  // Resolve the complete identity set before any read can change execution state.
  const context_text = await ctx.get_text();
  const template_text = await get_merged_template_text(template_items);
  const needs_vault_tags = template_text.includes('{{vault_tags}}')
    || user_message.includes('{{vault_tags}}');
  return build_prompt_text({
    context_text,
    template_text,
    user_message,
    vault_tags: needs_vault_tags ? get_vault_tags(this.env) : '',
  });
}

function resolve_ctx(template_item, params = {}) {
  if (params.ctx) return params.ctx;
  if (typeof params.ctx_key === 'string' && params.ctx_key) {
    return template_item?.env?.smart_contexts?.get?.(params.ctx_key) || null;
  }
  return null;
}
