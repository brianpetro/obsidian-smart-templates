import { Plugin } from "obsidian";
import { parse_template } from "./src/content_parsers/parse_templates.js";
import { SmartEnv, merge_env_config } from "obsidian-smart-env";
import { SmartTemplatesSettingTab } from "./settings_tab.js";
import { smart_completions, SmartCompletion } from "smart-completions";
import { TemplateSelectorModal } from "./src/modals/template_selector_modal.js";
// import { BuildContextModal } from "./src/modals/build_context_modal.js";
// import { UserMessageModal } from "./src/modals/user_message_modal.js";
import { smart_contexts } from "smart-contexts";
import { smart_env_config } from './smart_env.config.js';
import { smart_env_config as smart_context_env_config } from "smart-context-obsidian/smart_env.config.js";

export default class SmartTemplatesPlugin extends Plugin {
  compiled_smart_env_config = smart_env_config;
  smart_env_config = {
    collections: {
      // smart_sources: {
      //   content_parsers: [parse_template],
      // },
      // not is base obsidian smart-env
      smart_completions,
      smart_contexts,
      // smart_templates
    },
    item_types: {
      // SmartTemplate,
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

    this.load_templates();

    this.register_commands();
    // Register the new Smart Templates settings tab
    this.addSettingTab(new SmartTemplatesSettingTab(this.app, this));

  }

  load_templates() {
    const settings = this.env.settings.smart_templates_plugin;
    const folder = settings?.template_folder
      || this.app.internalPlugins.plugins?.templates?.instance?.options?.folder;
    let name;
    if (settings?.template_name) {
      name = settings.template_name;
      if (!name.endsWith('.md')) {
        name += '.md';
      }
    }

    // import smart_templates
    const template_sources = this.env.smart_sources.filter(i => {
      if (folder && i.key.startsWith(folder)) return true;
      if (name && i.key.endsWith(name)) return true;
      if (i.metadata?.['smart template']) return true;
    });
    template_sources.forEach(source => {
      this.env.smart_templates.create_or_update({ source_key: source.key });
    });
  }

  register_commands() {
    this.addCommand({
      id: "generate_from_template",
      name: "Generate from template",
      callback: async () => {
        TemplateSelectorModal.open(this.env);
      }
    });
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
