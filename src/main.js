import {
  MarkdownView,
  TFile,
} from 'obsidian';
import { SmartEnv, SmartPlugin } from 'obsidian-smart-env';
import { smart_env_config } from './default.config.js';
import { SmartTemplatesSettingTab } from './views/settings_tab.js';
import { ReleaseNotesView } from './views/release_notes_view.js';
import { TemplateContextModal } from './modals/template_context_modal.js';
import { CreateFromTemplateModal } from './modals/create_from_template_modal.js';

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
    await this.SmartEnv.wait_for({ loaded: true });

    this.register_commands();
    this.register_ribbon_icons();
    this.register_item_views();
    this.register_file_menu();

    this.addSettingTab(new this.SettingsTab(this.app, this));

    await this.check_for_updates();
  }

  get item_views() {
    return {
      release_notes: this.ReleaseNotesView,
    };
  }

  get ribbon_icons() {
    return {
      open_template_context: {
        icon_name: 'file-plus',
        description: 'Smart Templates: Open template context',
        callback: () => {
          this.open_template_context_modal();
        },
      },
    };
  }

  get commands() {
    return {
      open_template_context: {
        id: 'open-template-context',
        name: 'Open template context',
        checkCallback: (checking) => {
          if (!this.can_open_template_context()) return false;
          if (checking) return true;
          this.open_template_context_modal();
          return true;
        },
      },
      create_from_template: {
        id: 'create-from-template',
        name: 'Create from template',
        checkCallback: (checking) => {
          if (!this.can_open_template_context()) return false;
          if (checking) return true;
          this.open_create_from_template_modal();
          return true;
        },
      },
    };
  }

  /**
   * Determine whether the template modal can be opened.
   *
   * @returns {boolean}
   */
  can_open_template_context() {
    return Boolean(this.env?.smart_templates && this.env?.smart_contexts);
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
   * Resolve the CreateFromTemplateModal class from env config so Pro can override it.
   *
   * @returns {typeof CreateFromTemplateModal}
   */
  get_create_from_template_modal_class() {
    return this.env?.config?.modals?.create_from_template?.class || CreateFromTemplateModal;
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
    if (explicit_items?.length) return explicit_items;

    if (typeof params.source_key === 'string' && params.source_key.trim().length) {
      return [params.source_key];
    }

    const editor = this.get_editor();
    const active_file = this.get_active_file();
    const ignore_selection = params.ignore_selection === true;
    const selection_text = !ignore_selection && editor
      ? String(editor.getSelection?.() || '').trim()
      : ''
    ;

    if (selection_text.length) {
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
   * @returns {import('./modals/template_context_modal.js').TemplateContextModal}
   */
  open_template_context_modal(params = {}) {
    const ctx = this.create_seed_context(params);
    const ModalClass = this.get_template_context_modal_class();
    return ModalClass.open(ctx, {
      ...params,
    });
  }

  /**
   * Open the create-from-template alias modal.
   *
   * @param {object} [params={}]
   * @returns {import('./modals/create_from_template_modal.js').CreateFromTemplateModal}
   */
  open_create_from_template_modal(params = {}) {
    const ctx = this.create_seed_context(params);
    const ModalClass = this.get_create_from_template_modal_class();
    return ModalClass.open(ctx, {
      ...params,
    });
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
          .onClick(() => {
            this.open_template_context_modal({
              source_key: file.path,
              ignore_selection: true,
            });
          });
      });
    }));
  }
}

export default SmartTemplatesPlugin;
