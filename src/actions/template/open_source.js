import { run_action_entry } from 'smart-environment/utils/action_entry.js';

/** Navigate through the existing configured source action, including blocks. */
export async function template_open_source(params = {}) {
  if (this.deleted || this.collection.get(this.key) !== this) {
    throw new Error('This template is no longer available.');
  }
  if (!this.data.source_key) return null;
  const source = this.source;
  if (!source || source.deleted) throw new Error('The template source is unavailable.');
  return await run_action_entry(source, 'source_open', { event: params.event }, {
    event_source: params.event_source || 'template.open_source',
  });
}

export const display_name = 'Open template source';
export const action_scope = { type: 'item', collection_key: 'smart_templates', item_arg: 'template_key' };
export const menus = {
  'template:action_menu': {
    title: 'Open source', icon: 'external-link', order: 30,
    when({ scope }) { return Boolean(scope && !scope.deleted && scope.data.source_key); },
  },
};
