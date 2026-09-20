import { copy_to_clipboard } from 'obsidian-smart-env/src/utils/copy_to_clipboard.js';
import { normalize_selected_template_keys } from '../../utils/selected_templates.js';

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
  const context_key = params.ctx?.key || params.ctx_key;
  const selected_template_keys = normalize_selected_template_keys(
    params.selected_template_keys,
    params.selected_template_key || this.key,
  );
  // Snapshot caller-owned arrays without filtering invalid execution inputs.
  const build_params = {
    ...params,
    ...(Array.isArray(params.selected_template_keys)
      ? { selected_template_keys: [...params.selected_template_keys] }
      : {}),
  };
  const prompt_text = await this.actions.template_build_prompt(build_params);
  const copied = await copy_to_clipboard(prompt_text);
  if (!copied) throw new Error('Template prompt could not be copied to the clipboard.');

  this.emit_event?.('template:copied', {
    context_key,
    selected_template_keys,
  });

  if (params.skip_notice !== true) {
    this.env?.events?.emit?.('templates:prompt_copied', {
      level: 'info',
      message: 'Template prompt copied to clipboard.',
      context_key,
      selected_template_keys,
      event_source: 'template.actions.template_copy_with_context',
    });
  }

  return prompt_text;
}

