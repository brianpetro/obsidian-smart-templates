/** Navigate the configured source; do not evaluate its Base or reconstruct views. */
export async function smart_templates_open_discovery_base(params = {}) {
  const mapping = this.discovery_adapters.bases.get_mapping(params);
  if (!mapping) return null;
  const source = this.env.smart_sources?.get(mapping.base_key);
  if (!source || source.deleted) throw new Error(`Template Base source is unavailable: ${mapping.base_key}`);
  if (typeof source.actions?.source_open !== 'function') throw new Error('Source navigation is unavailable.');
  await source.actions.source_open();
  return source;
}

export const display_name = 'Open template discovery Base';
export const action_scope = { type: 'collection', collection_key: 'smart_templates' };
export const menus = {
  'smart_templates:menu': {
    title: 'Open discovery Base', icon: 'table', order: 20,
    when({ scope, params }) {
      try { return Boolean(scope.discovery_adapters.bases.get_mapping(params)); }
      catch { return false; }
    },
  },
};
