import { SmartItemView } from 'obsidian-smart-env/views/smart_item_view.js';
import { run_action_entry } from 'smart-environment/utils/action_entry.js';
import { normalize_selected_template_keys, require_visible_templates } from '../utils/selected_templates.js';

export const TEMPLATES_LIST_VIEW_TYPE = 'smart-templates-list';

/**
 * Thin library host. Catalog and inference remain collection-owned; query,
 * selected/focused keys and cancellation belong to this exact leaf.
 */
export class TemplatesListView extends SmartItemView {
  static get view_type() { return TEMPLATES_LIST_VIEW_TYPE; }
  static get display_text() { return 'Templates'; }
  static get icon_name() { return 'library'; }
  static get default_open_location() { return 'tab'; }

  constructor(leaf, plugin) {
    super(leaf, plugin);
    this.list_state = { scope_source_key: null, query: '', selected_template_keys: [], focused_template_key: null };
    this.scope_initialized = false;
    this.closed = false;
    this.render_controller = null;
    this.opening_request = false;
  }

  /** Persist navigation only; never serialize selections, Context or read text. */
  getState() {
    const { scope_source_key, query, focused_template_key } = this.list_state;
    return { scope_source_key, query, focused_template_key };
  }

  async setState(state = {}, result) {
    this.apply_state(state);
    await super.setState(this.getState(), result);
    if (!this.closed) await this.render_view_when_ready();
  }

  apply_state(params = {}) {
    if (Object.prototype.hasOwnProperty.call(params, 'scope_source_key')) {
      const scope = typeof params.scope_source_key === 'string' && params.scope_source_key.trim()
        ? params.scope_source_key.trim() : null;
      if (scope !== this.list_state.scope_source_key) {
        this.list_state.selected_template_keys = [];
        this.list_state.focused_template_key = null;
      }
      this.list_state.scope_source_key = scope;
      this.scope_initialized = true;
    }
    if (typeof params.query === 'string') this.list_state.query = params.query;
    if (Object.prototype.hasOwnProperty.call(params, 'focused_template_key')) {
      this.list_state.focused_template_key = typeof params.focused_template_key === 'string'
        ? params.focused_template_key : null;
    }
  }

  async onOpen() {
    this.closed = false;
    await super.onOpen();
  }

  async onClose() {
    this.closed = true;
    this.render_controller?.abort();
    this.container?.replaceChildren();
    await super.onClose?.();
  }

  /** The shared opener can schedule a late render; never resurrect a closed leaf. */
  async render_view(params = {}) {
    if (this.closed) return;
    this.apply_state(params);
    if (!this.scope_initialized) {
      this.apply_state({ scope_source_key: this.app.workspace.getActiveFile?.()?.path ?? null });
    }
    this.render_controller?.abort();
    const controller = new AbortController();
    this.render_controller = controller;
    const scope_source_key = this.list_state.scope_source_key;
    this.container.replaceChildren();
    const loading = this.container.ownerDocument.createElement('p');
    loading.textContent = 'Preparing template discovery...';
    loading.setAttribute('role', 'status');
    this.container.appendChild(loading);
    try {
      await this.env.smart_templates.prepare_templates({ scope_source_key });
      if (controller.signal.aborted || this.closed) return;
      const list = await this.env.smart_components.render_component('template_list', this.env.smart_templates, {
        view: this, signal: controller.signal,
      });
      if (controller.signal.aborted || this.closed) return;
      if (!list) throw new Error('The Templates list component is unavailable.');
      list.classList.add('item-view');
      this.container.replaceChildren(list);
    } catch (error) {
      if (controller.signal.aborted || this.closed) return;
      controller.abort();
      loading.textContent = `Unable to open Templates: ${error.message}`;
      loading.setAttribute('role', 'alert');
      const retry = loading.ownerDocument.createElement('button');
      retry.type = 'button'; retry.textContent = 'Retry';
      retry.addEventListener('click', () => { void this.render_view(); });
      loading.appendChild(retry);
    }
  }

  async use_current_scope() {
    const scope_source_key = this.app.workspace.getActiveFile?.()?.path ?? null;
    if (!scope_source_key) throw new Error('Activate a note before choosing Use current note as scope.');
    this.apply_state({ scope_source_key });
    this.save_navigation();
    await this.render_view();
  }

  set_query(query) {
    this.list_state.query = query;
    this.save_navigation();
  }

  focus_template(key) {
    this.list_state.focused_template_key = key;
    this.save_navigation();
  }

  toggle_selected_template(key) {
    require_visible_templates(this.env.smart_templates, [key], this.list_state);
    const selected = this.list_state.selected_template_keys;
    this.list_state.selected_template_keys = selected.includes(key)
      ? selected.filter((entry) => entry !== key)
      : normalize_selected_template_keys([...selected, key]);
  }

  clear_selection() { this.list_state.selected_template_keys = []; }

  save_navigation() { this.app.workspace.requestSaveLayout?.(); }

  /**
   * Explicit request handoff. No current-editor fallback after the library has
   * frozen its scope. Revalidate all selected identities rather than dropping any.
   */
  async use_templates(keys = this.list_state.selected_template_keys) {
    if (this.closed || this.opening_request) return false;
    const selected_template_keys = [...keys];
    if (!selected_template_keys.length) throw new Error('Select at least one template.');
    const scope_source_key = this.list_state.scope_source_key;
    require_visible_templates(this.env.smart_templates, selected_template_keys, { scope_source_key });
    this.opening_request = true;
    try {
      return await run_action_entry(this.env, 'template_open_context', {
        plugin: this.plugin,
        scope_source_key,
        context_items: scope_source_key ? [scope_source_key] : [],
        ignore_selection: true,
        selected_template_keys,
      }, { event_source: 'templates_list.use' });
    } finally { this.opening_request = false; }
  }
}
