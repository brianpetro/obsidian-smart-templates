/**
 * @module build_prompt_text
 *
 * Pure helper that compiles:  
 *   1. Context (via ctx.compile)  
 *   2. User‑supplied instructions (after {{vault_tags}} expansion)  
 *   3. Template instructions (wrapped in BEGIN/END TEMPLATE)  
 * Returns a single string ready to paste into any chat UI.
 */

import { replace_vault_tags_var } from 'obsidian-smart-env/utils/replace_vault_tags_var.js';

const template_wrappers = {
  before:
    '<important>\n' +
    'Important: use the following template to format your response:\n' +
    '- should output exact headings\n' +
    '- should interpret non-heading template text as instructions\n' +
    '- should not output any other text outside of the template\n' +
    '- should not output XML tags or other formatting\n' +
    '</important>\n' +
    '<template>',
  after: '</template>'
};

function format_section(section) {
  if (typeof section !== 'string') return '';
  const trimmed = section.trim();
  return trimmed.length ? trimmed : '';
}

/**
 * Wraps template text in standard delimiters.
 * @param {string} template_text
 * @param {Object} templates
 * @returns {string}
 */
function compile_template_instructions(template_text, templates = template_wrappers) {
  const template_body = format_section(template_text);
  if (!template_body) return '';
  return `${templates.before}\n${template_body}\n${templates.after}`;
}

function format_instructions(instructions, ctx, tmpl) {
  const trimmed = format_section(instructions);
  if (!trimmed || !trimmed.includes('{{vault_tags}}')) return trimmed;
  const app = ctx?.app || tmpl?.env?.app;
  return replace_vault_tags_var.call({ app }, trimmed);
}

/**
 * Build full prompt string.
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {import('../items/smart_template.js').SmartTemplate} tmpl
 * @param {string} user_msg
 * @returns {Promise<string>}
 */
export async function build_prompt_text(ctx, tmpl, user_msg = '') {
  if (!ctx || !tmpl) return '';

  const [context, template_text] = await Promise.all([
    ctx.get_text?.() ?? '',
    tmpl.get_template?.() ?? ''
  ]);

  const instructions = format_instructions(user_msg, ctx, tmpl);
  const template_instructions = compile_template_instructions(template_text);
  const context_block = format_section(context);

  const segments = [
    instructions,
    template_instructions,
    context_block,
    instructions,
    template_instructions
  ].map(format_section).filter(Boolean);

  return segments.join('\n\n');
}
