/**
 * Read the exact template using its existing read contract, including null and
 * existing Source/Block compatibility behavior. Internal P5 action; no Tool.
 * @this {import('../../items/smart_template.js').SmartTemplate}
 * @returns {Promise<string|null>}
 */
export async function template_read() {
  return await this.read();
}

export const display_name = 'Read template';
export const action_scope = { type: 'item', collection_key: 'smart_templates', item_arg: 'template_key' };
