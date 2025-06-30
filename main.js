import { Plugin } from "obsidian";
import { SmartEnv, merge_env_config } from "obsidian-smart-env";
import { SmartTemplatesSettingTab } from "./settings_tab.js";
import { smart_completions, SmartCompletion } from "smart-completions";
import { TemplateSelectorModal } from "./src/modals/template_selector_modal.js";
import { smart_contexts } from "smart-contexts";
import { smart_env_config } from './smart_env.config.js';
import { smart_env_config as smart_context_env_config } from "smart-context-obsidian/smart_env.config.js";

export default class SmartTemplatesPlugin extends Plugin {
  compiled_smart_env_config = smart_env_config;
  smart_env_config = {
    collections: {
      smart_completions,
      smart_contexts,
    },
    item_types: {
      SmartCompletion,
    },
    default_settings: {
      smart_templates_plugin: {
        smart_completions: {
          chat_model: {
            adapter: "ollama",
          },
        },
      },
      smart_contexts: {
        smart_templates_plugin: {
          templates: {
            '-1': {
              before: `<context>\n<file_tree>\n{{FILE_TREE}}\n</file_tree>`,
              after: `</context>`
            },
            '0': {
              before: `<context_primary path="{{ITEM_PATH}}" mtime="{{ITEM_TIME_AGO}}">`,
              after: `</context_primary>`
            },
            '1': {
              before: `<context_linked path="{{ITEM_PATH}}" mtime="{{ITEM_TIME_AGO}}">`,
              after: `</context_linked>`
            },
          },
        },
      },
    },
  };
  onload() {
    const merged_config = merge_env_config(this.compiled_smart_env_config, this.smart_env_config);
    merge_env_config(merged_config, smart_context_env_config);
    SmartEnv.create(this, merged_config);
    this.app.workspace.onLayoutReady(this.initialize.bind(this));
  }

  /**
   * @deprecated use env.smart_notices instead
   */
  get notices() {
    return this.env.notices;
  }

  async initialize() {
    await SmartEnv.wait_for({loaded: true});

    this.register_commands();
    // Register the new Smart Templates settings tab
    this.addSettingTab(new SmartTemplatesSettingTab(this.app, this));

  }

  register_commands() {
    this.addCommand({
      id: "generate_from_template",
      name: "Generate from template",
      editorCallback: async (editor) => {
        // get highlighted text or active file
        const add_items = [];
        const selection = editor.getSelection();
        const active_file = this.app.workspace.getActiveFile();
        if(this.has_context_early && selection) {
          add_items.push({ key: `selection:${active_file.path}`, content: selection });
        }else{
          if (active_file) {
            add_items.push(active_file.path);
          }
        }
        this.env.smart_templates.current_context = this.env.smart_contexts.new_context({}, { add_items });
        TemplateSelectorModal.open(this.env);
      }
    });
  }
  // used to determine if the early-release smart-context plugin is installed
  // prevents attempting to use features that require early context features (ex. text as context item)
  get has_context_early() {
    return (this.env.smart_context_plugin?.manifest?.name?.toLowerCase() || '').includes('early')
  }

  get_editor() {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (!activeLeaf || !activeLeaf.view || !activeLeaf.view.editor) {
      return null;
    }
    return activeLeaf.view.editor;
  }
  get chat_model() {
    if (!this._chat_model) {
      this._chat_model = this.env.init_module('smart_chat_model', {
        model_config: {},
        settings: this.env.settings.smart_templates_plugin.smart_completions.chat_model,  // each platform's config
        env: this.env,
        reload_model: this.reload_chat_model.bind(this),
        re_render_settings: this.re_render_settings?.bind(this) ?? (() => { this.app.setting.openTabById('smart-templates'); }),
      });
    }
    return this._chat_model;
  }
  reload_chat_model() {
    console.log('reload_chat_model', this.env.settings.smart_templates_plugin.smart_completions.chat_model);
    if (this._chat_model?.unload) {
      this._chat_model.unload();
    }
    this._chat_model = null;
  }
}
