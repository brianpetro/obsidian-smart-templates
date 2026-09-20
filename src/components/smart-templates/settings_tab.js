import { render_settings_config } from 'obsidian-smart-env/src/utils/render_settings_config.js';
import { has_template_base_config, parse_template_base_config, resolve_template_base } from '../../utils/template_base.js';
import { attach_template_disposer } from '../../utils/template_component.js';
import styles from './settings_tab.css';
import { resolve_template_folders } from '../../utils/template_discovery.js';

/** Render Smart Templates settings through the existing component/settings hosts. */
export function get_effective_settings(templates) {
  const config = templates.settings_config;
  const effective = has_template_base_config(templates.settings) ? {} : {
    template_folder: config.template_folder,
    template_name: config.template_name,
  };
  // Base membership still permits configured heading sections within member notes.
  effective.template_headings = {
    ...config.template_headings,
    name: has_template_base_config(templates.settings) ? 'Sections within Base results' : 'Matching headings',
  };
  return effective;
}

/** Saved configuration only: a draft never masquerades as the active source. */
export function get_source_summary(templates, params = {}) {
  if (has_template_base_config(templates.settings)) {
    try {
      const config = parse_template_base_config(templates.settings);
      const base = resolve_template_base(config, params.scope_source_key);
      if (!base) return 'Folder-specific Bases are configured, but none applies to this note.';
      return `${base.base_key} / ${base.view_name || 'First declared view'}`
        + (base.folder ? ` (for ${base.folder})` : '');
    } catch (error) { return `Base configuration needs attention: ${error.message}`; }
  }
  const env = templates.env;
  const app = env.obsidian_app || env.plugin?.app || env.main?.app;
  const native_folder = app?.internalPlugins?.plugins?.templates?.instance?.options?.folder || '';
  const folders = resolve_template_folders(templates.settings, native_folder);
  return folders.length ? `${folders.join(', ')} (plus matching note rules)` : 'Filename, frontmatter and section rules';
}

/** @param {import('../../views/settings_tab.js').SmartTemplatesSettingTab} settings_tab */
export function build_html(settings_tab) {
  const settings = settings_tab.env?.smart_templates?.settings || {};
  return `<div class="smart-templates-settings-tab">
    <div class="setting-item st-template-settings__source">
      <div class="setting-item-info"><div class="setting-item-name">Templates from</div>
        <div class="setting-item-description st-template-base-settings__source"></div></div>
      <div class="setting-item-control"><button type="button" data-template-setting="open">Open Base</button></div>
    </div>
    <div class="st-template-base-settings__status"></div>
    <fieldset class="st-template-settings__rules"><legend>Rules</legend><div class="smart-templates"></div></fieldset>
    <p class="st-template-settings__rules-note"></p>
    <details class="st-template-base-settings">
      <summary>Advanced discovery</summary>
      <p>Choose a Base to control which vault notes appear. Leave both the Base file and folder overrides empty to use folder and note rules.</p>
      <div class="setting-item"><label class="setting-item-info" for="st-template-base-file">
        <span class="setting-item-name">Base file</span></label><div class="setting-item-control">
        <input id="st-template-base-file" type="text" data-base-setting="template_base" value="${escape_html(settings.template_base || '')}" placeholder="Templates/Smart Templates.base"></div></div>
      <div class="setting-item st-template-base-settings__view"><label class="setting-item-info" for="st-template-base-view">
        <span class="setting-item-name">View</span><span class="setting-item-description">Leave empty to use the first view.</span></label><div class="setting-item-control">
        <input id="st-template-base-view" type="text" data-base-setting="template_base_view" value="${escape_html(settings.template_base_view || '')}" placeholder="First view"></div></div>
      <details class="st-template-base-settings__advanced"><summary>Different templates by folder</summary>
        <label for="st-template-base-scopes">Folder overrides</label>
        <textarea id="st-template-base-scopes" data-base-setting="template_base_scopes" rows="4" placeholder="Projects | Templates/Project Templates.base | Templates">${escape_html(settings.template_base_scopes || '')}</textarea>
        <p>One folder | Base path | optional view per line. The most specific folder wins.</p>
      </details>
      <p class="st-template-base-settings__draft" role="status" hidden>Unsaved source changes. Save or discard before using the current configuration.</p>
      <div class="st-template-base-settings__actions">
        <button type="button" data-template-setting="apply" class="mod-cta" hidden disabled>Save changes</button>
        <button type="button" data-template-setting="discard" hidden disabled>Discard changes</button>
        <button type="button" data-template-setting="create">Create Base from Templates folder</button>
      </div>
    </details>
    <details class="st-template-settings__maintenance"><summary>Refresh</summary>
      <p class="st-template-settings__refresh-help"></p>
      <button type="button" data-template-setting="refresh">Refresh Base results</button>
    </details>
    <p class="st-template-base-settings__error" role="alert"></p>
  </div>`;
}

export async function render(settings_tab, params = {}) {
  this.apply_style_sheet(styles);
  const container = this.create_doc_fragment(build_html(settings_tab)).firstElementChild;
  await post_process.call(this, settings_tab, container, params);
  return container;
}

export async function post_process(settings_tab, container, params = {}) {
  const env = settings_tab?.env;
  const templates = env?.smart_templates;
  if (!templates) {
    container.querySelector('.st-template-base-settings__error').textContent = 'Templates is waiting for Smart Environment.';
    container.querySelectorAll('button, input, textarea').forEach((control) => { control.disabled = true; });
    return container;
  }
  const app = env.obsidian_app || env.plugin?.app || env.main?.app;
  const scope_source_key = params.scope_source_key ?? app?.workspace?.getActiveFile?.()?.path ?? null;
  const render_rules = () => {
    const target = container.querySelector('.smart-templates');
    target.replaceChildren();
    render_settings_config(get_effective_settings(templates), templates, target, {
      default_group_name: has_template_base_config(templates.settings) ? 'Sections' : 'Folder and note rules',
    });
    container.querySelector('.st-template-settings__rules-note').textContent = has_template_base_config(templates.settings)
      ? 'Folder and filename rules are not used while a Base is configured. Their saved values are unchanged.'
      : 'Folder settings use the Obsidian Templates folder when no custom folder is selected. Notes marked smart template also qualify.';
  };
  render_rules();
  // Attach control cleanup before awaiting another component's rendering.
  wire_base_controls.call(this, templates, container, { scope_source_key, signal: params.signal, on_change: render_rules });
  const status = await env.smart_components.render_component('smart_templates_index_status', templates, {
    scope_source_key, signal: params.signal, mode: 'discovery', show_summary: false,
  });
  if (status && !params.signal?.aborted) container.querySelector('.st-template-base-settings__status').appendChild(status);
  return container;
}

/** Publish a complete validated draft only on Save; maintenance uses saved values. */
export function wire_base_controls(templates, container, params = {}) {
  const error_el = container.querySelector('.st-template-base-settings__error');
  const keys = ['template_base', 'template_base_view', 'template_base_scopes'];
  const fields = keys.map((key) => container.querySelector(`[data-base-setting="${key}"]`));
  const buttons = [...container.querySelectorAll('[data-template-setting]')];
  const rules = container.querySelector('.st-template-settings__rules');
  const draft_notice = container.querySelector('.st-template-base-settings__draft');
  const source_el = container.querySelector('.st-template-base-settings__source');
  const scope = { scope_source_key: params.scope_source_key ?? null };
  const view_row = container.querySelector('.st-template-base-settings__view');
  let active = true;
  let busy = false;
  let rendered_base_enabled = has_template_base_config(templates.settings);
  const dirty = () => fields.some((field, index) => field.value.trim() !== String(templates.settings[keys[index]] || '').trim());
  const reset = () => fields.forEach((field, index) => { field.value = templates.settings[keys[index]] || ''; });
  const sync = () => {
    if (!active) return;
    const changed = dirty();
    const base_enabled = has_template_base_config(templates.settings);
    if (rendered_base_enabled !== base_enabled) {
      rendered_base_enabled = base_enabled;
      params.on_change?.();
    }
    view_row.hidden = !fields[0].value.trim();
    let applicable_base = null;
    if (base_enabled) {
      try { applicable_base = resolve_template_base(parse_template_base_config(templates.settings), scope.scope_source_key); }
      catch { /* The source summary exposes invalid saved configuration. */ }
    }
    source_el.textContent = get_source_summary(templates, scope);
    const maintenance = container.querySelector('.st-template-settings__maintenance');
    if (maintenance) maintenance.hidden = !base_enabled;
    const help = container.querySelector('.st-template-settings__refresh-help');
    if (help) help.textContent = 'Refresh after changing properties used by this Base. Recurring-structure scans are available in the library only without Base discovery.';
    draft_notice.hidden = !changed;
    rules.disabled = busy || changed;
    fields.forEach((field) => { field.disabled = busy; });
    buttons.forEach((button) => {
      const action = button.getAttribute('data-template-setting');
      const draft_action = action === 'apply' || action === 'discard';
      button.hidden = draft_action ? !changed : action === 'create' ? base_enabled
        : action === 'open' ? !applicable_base : false;
      button.disabled = busy || (draft_action ? !changed : changed);
    });
  };
  const on_input = () => { error_el.textContent = ''; sync(); };
  const on_click = async (event) => {
    const button = event.target.closest('[data-template-setting]');
    if (!button || busy || !active || button.hidden || button.disabled) return;
    event.preventDefault();
    const action = button.getAttribute('data-template-setting');
    if (action === 'discard') { reset(); error_el.textContent = ''; sync(); return; }
    busy = true; sync(); error_el.textContent = '';
    try {
      if (action === 'apply') {
        const draft = Object.fromEntries(keys.map((key, index) => [key, fields[index].value]));
        templates.set_base_settings(draft);
        reset();
        await templates.prepare_templates(scope);
      } else if (action === 'refresh') {
        await templates.actions.smart_templates_update_index(scope);
      } else if (action === 'open') {
        const source = await templates.actions.smart_templates_open_discovery_base(scope);
        if (!source && active) error_el.textContent = 'No Base applies to this note.';
      } else if (action === 'create') {
        const result = await templates.actions.smart_templates_create_base(scope);
        if (active) {
          reset();
          error_el.textContent = result.issues.join(' ');
        }
      }
    } catch (error) {
      if (active) error_el.textContent = error.message;
    } finally { busy = false; sync(); }
  };
  container.addEventListener('input', on_input);
  container.addEventListener('click', on_click);
  const unsubscribe = templates.env.events.on('templates:index_changed', sync);
  attach_template_disposer(this, container, () => {
    active = false; unsubscribe();
    container.removeEventListener('input', on_input);
    container.removeEventListener('click', on_click);
  }, params.signal);
  sync();
}

function escape_html(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export const version = 1;
