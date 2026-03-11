import { Notice } from 'obsidian';
import { copy_to_clipboard } from 'obsidian-smart-env/utils/copy_to_clipboard.js';
import { build_prompt_text } from '../../utils/build_prompt_text.js';

/**
 * Build a prompt from template + context and copy it to the clipboard.
 *
 * @this {import('../../items/smart_template.js').SmartTemplate}
 * @param {object} [params={}]
 * @param {import('smart-contexts').SmartContext} [params.ctx]
 * @param {string} [params.ctx_key]
 * @param {string} [params.user_message]
 * @param {boolean} [params.skip_notice=false]
 * @returns {Promise<string>}
 */
export async function template_copy_with_context(params = {}) {
  const ctx = resolve_ctx(this, params);
  if (!ctx) {
    throw new Error('template_copy_with_context requires params.ctx or params.ctx_key');
  }

  const user_message = typeof params.user_message === 'string'
    ? params.user_message
    : ''
  ;

  const prompt_text = await build_prompt_text(ctx, this, user_message);
  await copy_to_clipboard(prompt_text);

  this.emit_event?.('template:copied', {
    context_key: ctx.key,
  });

  if (params.skip_notice !== true) {
    new Notice('Template prompt copied to clipboard.');
  }

  return prompt_text;
}

function resolve_ctx(template_item, params = {}) {
  if (params.ctx) return params.ctx;
  if (typeof params.ctx_key === 'string' && params.ctx_key) {
    return template_item?.env?.smart_contexts?.get?.(params.ctx_key) || null;
  }
  return null;
}
