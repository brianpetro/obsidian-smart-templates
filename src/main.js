import {
  MarkdownView,
  TFile,
} from 'obsidian';
import { SmartEnv, SmartPlugin } from 'obsidian-smart-env';
import { run_action_entry } from 'smart-environment/utils/action_entry.js';
import { smart_env_config } from './default.config.js';
import { SmartTemplatesSettingTab } from './views/settings_tab.js';
import { ReleaseNotesView } from './views/release_notes_view.js';
import { TemplateContextModal } from './modals/template_context_modal.js';
import { TemplatesListView } from './views/templates_list_view.js';
import { require_visible_templates } from './utils/selected_templates.js';

/**
 * Smart Templates core plugin host.
 */
export class SmartTemplatesPlugin extends SmartPlugin {
  SmartEnv = SmartEnv;
  ReleaseNotesView = ReleaseNotesView;
  SettingsTab = SmartTemplatesSettingTab;

  onload() {
    this.app.workspace.onLayoutReady(this.initialize.bind(this));
    this.SmartEnv.create(this, smart_env_config);
    this.register_item_views({ skip_command_registration: true });
    this.addSettingTab(new this.SettingsTab(this.app, this, 'file-plus'));
  }

  onunload() {
    this.env?.unload_main?.(this);
  }

  /**
   * Bootstrap after the workspace is ready.
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    this.register_ribbon_actions();
    await this.SmartEnv.wait_for({ loaded: true });

    this.register_command_actions();
    this.register_file_menu();

    await this.check_for_updates();
  }

  get item_views() {
    return {
      release_notes: this.ReleaseNotesView,
      templates_list: TemplatesListView,
    };
  }

  /**
   * Resolve the active editor, if any.
   *
   * @returns {import('obsidian').Editor|null}
   */
  get_editor() {
    return this.app.workspace.getActiveViewOfType(MarkdownView)?.editor || null;
  }

  /**
   * Resolve the active note, if any.
   *
   * @returns {import('obsidian').TFile|null}
   */
  get_active_file() {
    return this.app.workspace.getActiveFile?.() || null;
  }

  /**
   * Resolve the TemplateContextModal class from env config so Pro can override it.
   *
   * @returns {typeof TemplateContextModal}
   */
  get_template_context_modal_class() {
    return this.env?.config?.modals?.template_context?.class || TemplateContextModal;
  }

  /**
   * Build a transient inline selection item for the Smart Context collection.
   *
   * @param {string} selection_text
   * @param {import('obsidian').TFile|null} active_file
   * @returns {{ key: string, content: string, size: number, mtime: number }}
   */
  build_selection_context_item(selection_text, active_file = null) {
    const source_label = active_file?.path || 'inline';
    const timestamp = Date.now();
    return {
      key: `selection:${timestamp}:${source_label}`,
      kind: 'text',
      content: selection_text,
      size: selection_text.length,
      mtime: timestamp,
    };
  }

  /**
   * Build the default context seed for a template request.
   * Editor selection overrides the active note when present.
   *
   * @param {object} [params={}]
   * @param {string} [params.source_key]
   * @param {boolean} [params.ignore_selection=false]
   * @returns {Array<string|object>}
   */
  get_default_context_items(params = {}) {
    const explicit_items = Array.isArray(params.context_items)
      ? params.context_items.filter(Boolean)
      : null
    ;
    if (explicit_items !== null) return explicit_items;

    if (typeof params.source_key === 'string' && params.source_key.trim().length) {
      return [params.source_key];
    }

    const editor = this.get_editor();
    const active_file = this.get_active_file();
    const ignore_selection = params.ignore_selection === true;
    const selection_text = !ignore_selection && editor
      ? String(editor.getSelection?.() || '')
      : ''
    ;

    if (selection_text.trim().length) {
      return [this.build_selection_context_item(selection_text, active_file)];
    }

    if (active_file?.path) {
      return [active_file.path];
    }

    return [];
  }

  /**
   * Create a fresh SmartContext seeded from the current workspace state.
   *
   * @param {object} [params={}]
   * @returns {import('smart-contexts').SmartContext}
   */
  create_seed_context(params = {}) {
    const add_items = this.get_default_context_items(params);
    return this.env.smart_contexts.new_context({}, { add_items });
  }

  /**
   * Open the shared template context modal.
   *
   * @param {object} [params={}]
   * @returns {Promise<import('./modals/template_context_modal.js').TemplateContextModal|null>}
   */
  async open_template_context_modal(params = {}) {
    // Capture selection and origin before preparation can yield to another editor.
    const request_params = {
      ...params,
      context_items: this.get_default_context_items(params),
      scope_source_key: params.scope_source_key ?? params.source_key ?? this.get_active_file()?.path ?? null,
    };
    await this.env.smart_templates.prepare_templates(request_params);
    if (this.env.smart_templates.unloaded) return null;
    if (params.selected_template_keys != null) {
      require_visible_templates(this.env.smart_templates, params.selected_template_keys, request_params);
    }
    const ctx = this.create_seed_context(request_params);
    const ModalClass = this.get_template_context_modal_class();
    return ModalClass.open(ctx, request_params);
  }

  /**
   * Register a file-menu entry that opens the template modal seeded with the clicked file.
   *
   * @returns {void}
   */
  register_file_menu() {
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!(file instanceof TFile)) return;
      if (file.extension !== 'md' && file.extension !== 'txt') return;

      menu.addItem((item) => {
        item
          .setTitle('Open template context')
          .setIcon('file-plus')
          .onClick(async () => {
            try {
              await run_action_entry(this.env, 'template_open_context', {
                plugin: this,
                source_key: file.path,
                ignore_selection: true,
              }, { event_source: 'smart_templates.file_menu' });
            } catch (error) {
              this.env.events.emit('templates:open_failed', {
                level: 'error',
                message: 'Unable to open template context.',
                details: error.message,
              });
            }
          });
      });
    }));
  }
}

export default SmartTemplatesPlugin;
