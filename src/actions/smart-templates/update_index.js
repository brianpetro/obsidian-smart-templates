/** Explicit index refresh; inference runs only when no Base policy is active. */
export async function smart_templates_update_index(params = {}) {
  return await this.refresh_templates({ ...params, scope_source_key: params.scope_source_key ?? null, derive: true });
}

export const display_name = 'Update template index';
export const action_scope = { type: 'collection', collection_key: 'smart_templates' };
export const commands = {
  'update-template-index': {
    name: 'Update template index',
    register_when({ plugin }) { return plugin.manifest.id === 'smart-templates'; },
    params({ app }) { return { scope_source_key: app.workspace?.getActiveFile?.()?.path ?? null }; },
    when({ scope }) { return Boolean(scope && !scope.unloaded); },
  },
};
export const menus = {
  'smart_templates:menu': { title: 'Update index', icon: 'refresh-cw', order: 10 },
};
