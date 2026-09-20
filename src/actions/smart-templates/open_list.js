/** Open the library through the existing registered SmartItemView helper. */
export function smart_templates_open_list(params = {}) {
  const plugin = params.plugin?.open_templates_list
    ? params.plugin : this.env.smart_templates_plugin;
  if (this.unloaded || typeof plugin?.open_templates_list !== 'function') return false;
  const scope_source_key = Object.prototype.hasOwnProperty.call(params, 'scope_source_key')
    ? params.scope_source_key : plugin.app.workspace.getActiveFile?.()?.path ?? null;
  const view_params = {
    scope_source_key,
    ...(typeof params.focused_template_key === 'string'
      ? { focused_template_key: params.focused_template_key } : {}),
  };
  // Native setViewState receives the frozen scope before the initial render.
  plugin.open_templates_list({ ...view_params, state: { ...view_params } });
  return true;
}

export const display_name = 'Browse templates';
export const display_description = 'Inspect saved and inferred templates without creating a request.';
export const action_scope = { type: 'collection', collection_key: 'smart_templates' };
export const commands = {
  'browse-templates': {
    name: 'Browse templates',
    register_when({ plugin }) { return plugin.manifest.id === 'smart-templates'; },
    params({ plugin }) { return { plugin }; },
    when({ scope }) { return Boolean(scope && !scope.unloaded); },
  },
};
export const menus = {
  'smart_templates:menu': { title: 'Browse templates', icon: 'library', order: 5 },
};
