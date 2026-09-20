import { copy_to_clipboard } from 'obsidian-smart-env/src/utils/copy_to_clipboard.js';

/** Copy reusable Markdown, not a compiled request. Existing read is unchanged. */
export async function template_copy_markdown() {
  if (this.deleted || this.collection.get(this.key) !== this) {
    throw new Error('This template is no longer available.');
  }
  const content = await this.actions.template_read();
  if (typeof content !== 'string') throw new Error('Template Markdown is unavailable.');
  if (!await copy_to_clipboard(content)) throw new Error('Unable to copy template Markdown.');
  return content;
}

export const display_name = 'Copy template Markdown';
export const action_scope = { type: 'item', collection_key: 'smart_templates', item_arg: 'template_key' };
export const menus = {
  'template:action_menu': {
    title: 'Copy template Markdown', icon: 'copy', order: 20,
    when({ scope }) { return Boolean(scope && !scope.deleted); },
  },
};
