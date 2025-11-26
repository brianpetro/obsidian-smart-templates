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

/**
 * Escape special RegExp characters in a string.
 * @param {string} str
 * @returns {string}
 */
function escape_reg_exp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Wraps template text in standard delimiters.
 * @param {string} template_text
 * @param {Object} templates
 * @returns {string}
 */
function compile_template_instructions(
  template_text,
  templates = {
    before:
      '<important>\n' +
      'Important: use the following template to format your response:\n' +
      '- should output exact headings\n' +
      '- should interpret non‑heading template text as instructions\n' +
      '- should not output any other text outside of the template\n' +
      '- should not output XML tags or other formatting\n' +
      '</important>\n' +
      '<template>',
    after: '</template>',
  },
) {
  return `${templates.before}\n${template_text}\n${templates.after}`;
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

  const context = await ctx.get_text();
  const template_text = await tmpl.get_template();

  let instructions = user_msg.trim();
  if (instructions.includes('{{vault_tags}}')) {
    instructions = replace_vault_tags_var(instructions);
  }

  const system_prompt = compile_template_instructions(template_text);

  return `${instructions}\n\n${system_prompt}\n\n${context}\n\n${instructions}\n\n${system_prompt}`.trim();
}
