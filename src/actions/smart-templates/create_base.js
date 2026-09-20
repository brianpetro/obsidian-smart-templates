import { build_template_base_content, is_vault_path } from '../../utils/template_base.js';

/**
 * Create a non-overwriting discovery scaffold in the native Templates folder.
 * After creation, later stage failures are reported without undoing the file.
 *
 * @this {import('../../collections/smart_templates.js').SmartTemplates}
 * @param {object} [params={}]
 * @returns {Promise<{file: object, configured: boolean, refreshed: boolean, opened: boolean, issues: string[]}>}
 */
export async function smart_templates_create_base(params = {}) {
  const app = this.env.obsidian_app || this.env.plugin?.app || this.env.main?.app;
  const folder = String(app?.internalPlugins?.plugins?.templates?.instance?.options?.folder || '').trim().replace(/\/+$/, '');
  if (!is_vault_path(folder)) throw new Error('Configure a native Obsidian Templates folder before creating a template Base.');
  const vault = app?.vault;
  if (!vault?.create || !vault.getAbstractFileByPath(folder)?.children) {
    throw new Error('The native Templates folder is unavailable.');
  }
  const path = `${folder}/Smart Templates.base`;
  if (vault.getAbstractFileByPath(path)) throw new Error(`Template Base already exists: ${path}`);
  // Capture origin before creating/importing can yield to another editor.
  const scope_source_key = params.scope_source_key ?? app.workspace.getActiveFile?.()?.path ?? path;
  const file = await vault.create(path, build_template_base_content(folder));
  const result = { file, configured: false, refreshed: false, opened: false, issues: [] };
  try {
    this.set_base_settings({ template_base: path, template_base_view: 'Templates' });
    result.configured = true;
    const state = await this.actions.smart_templates_update_index({ scope_source_key });
    result.refreshed = state?.status === 'ready' && state.base_key === path;
    if (!result.refreshed) result.issues.push(state?.issues?.[0]?.message || 'The new default Base was saved, but its index was not refreshed for this scope.');
  } catch (error) {
    result.issues.push(error.message);
  }
  try {
    await app.workspace.getLeaf('tab').openFile(file);
    result.opened = true;
  } catch (error) {
    result.issues.push(error.message);
  }
  this.emit_event('templates:base_created', {
    level: result.issues.length ? 'warning' : 'info',
    message: result.issues.length ? `Created ${path}. ${result.issues.join(' ')}` : `Created and configured ${path}.`,
  });
  return result;
}

export const display_name = 'Create template Base';
export const action_scope = { type: 'collection', collection_key: 'smart_templates' };
