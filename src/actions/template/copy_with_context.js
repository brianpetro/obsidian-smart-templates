import { copy_to_clipboard } from 'obsidian-smart-env/src/utils/copy_to_clipboard.js';
import { build_prompt_text } from '../../utils/build_prompt_text.js';
import { resolve_request_template } from '../../utils/selected_templates.js';

/**
 * Build a prompt from selected template(s) + context and copy it to the clipboard.
 *
 * @this {import('../../items/smart_template.js').SmartTemplate}
 * @param {object} [params={}]
 * @param {import('smart-contexts').SmartContext} [params.ctx]
 * @param {string} [params.ctx_key]
 * @param {string} [params.user_message]
 * @param {string[]} [params.selected_template_keys]
 * @param {boolean} [params.skip_notice=false]
 * @returns {Promise<string>}
 */
export async function template_copy_with_context(params = {}) {
  const ctx = resolve_ctx(this, params);
  if (!ctx) {
    throw new Error('template_copy_with_context requires params.ctx or params.ctx_key');
  }

  const request_template = await resolve_request_template(this, params);
  if (!request_template) {
    throw new Error('template_copy_with_context requires at least one selected template');
  }

  const user_message = typeof params.user_message === 'string'
    ? params.user_message
    : ''
  ;

  const prompt_text = await build_prompt_text(ctx, request_template, user_message);
  await copy_to_clipboard(prompt_text);

  this.emit_event?.('template:copied', {
    context_key: ctx.key,
    selected_template_keys: params.selected_template_keys || [this.key],
  });

  if (params.skip_notice !== true) {
    this.env?.events?.emit?.('templates:prompt_copied', {
      level: 'info',
      message: 'Template prompt copied to clipboard.',
      context_key: ctx.key,
      selected_template_keys: params.selected_template_keys || [this.key],
      event_source: 'template.actions.template_copy_with_context',
    });
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
