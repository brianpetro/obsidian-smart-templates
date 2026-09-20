/**
 * Transfer an exact inferred candidate to durable user ownership, retaining its
 * object, key, content, and historical provenance. Persistence is queued through
 * the existing collection lifecycle; this result is not a disk-write receipt.
 *
 * @this {import('../../items/smart_template.js').SmartTemplate}
 * @returns {import('../../items/smart_template.js').SmartTemplate}
 */
export function template_confirm() {
  return this.collection.confirm_template(this);
}

export const display_name = 'Keep inferred template';
export const display_description = 'Keep an inferred template as a durable inline template without creating a note.';
export const action_scope = { type: 'item', collection_key: 'smart_templates', item_arg: 'template_key' };
export const menus = {
  'template:action_menu': {
    title({ scope }) {
      return scope.data.transient === true ? 'Keep template' : 'Retry queued save';
    },
    icon: 'save', order: 10,
    when({ scope }) {
      if (!scope || scope.deleted) return false;
      const data = scope.data;
      return (data.transient === true && data.provider_key === 'derived_headings')
        || (data.transient === false && data.provider_key === null
          && data.provenance?.origin === 'derived_headings' && scope._queue_save === true);
    },
  },
};
