import { Plugin } from "obsidian";
import { parse_template } from "./src/content_parsers/parse_templates.js";
import { SmartEnv, merge_env_config } from "obsidian-smart-env";
import { SmartTemplatesSettingTab } from "./settings_tab.js";
import { smart_completions, SmartCompletion } from "smart-completions";
import { TemplateSelectionModal } from "./src/modals/template_selection_modal.js";
import { BuildContextModal } from "./src/modals/build_context_modal.js";
import { UserMessageModal } from "./src/modals/user_message_modal.js";
import { smart_contexts } from "smart-contexts";
import { smart_env_config } from './smart_env.config.js';

export default class SmartTemplatesPlugin extends Plugin {
  compiled_smart_env_config = smart_env_config;
  smart_env_config = {
    collections: {
      smart_sources: {
        content_parsers: [parse_template],
      },
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
      callback: async () => {
        this.open_template_selection_modal();
      }
    });
  }
  create_draft() {
    const file = this.app.workspace.getActiveFile();
    const source_item = this.env.smart_sources.get(file.path);
    this.template_item = source_item;
    this.build_context_modal.open();
  }


  get template_selection_modal() {
    if(!this._template_selection_modal) {
      this._template_selection_modal = new TemplateSelectionModal(this.app, this);
    }
    return this._template_selection_modal;
  }
  open_template_selection_modal() {
    this.template_selection_modal.open();
  }
  get build_context_modal() {
    if(!this._build_context_modal) {
      this._build_context_modal = new BuildContextModal(this.app, this);
    }
    return this._build_context_modal;
  }
  open_build_context_modal() {
    this.build_context_modal.open();
  }
  get user_message_modal() {
    if(!this._user_message_modal) {
      this._user_message_modal = new UserMessageModal(this.app, this);
    }
    return this._user_message_modal;
  }
  open_user_message_modal() {
    this.user_message_modal.open();
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
  async generate_template() {
    if(!this.env.smart_completions) {
      console.warn('SmartTemplate: smart_completions not found in environment');
      return null;
    }
    
    const completion_opts = {
      context_key: this.context_item.key,
      template_key: this.template_item.key,
      user_message: this.user_message,
    };
    
    // Create a completion with the template and context
    const completion = new this.env.smart_completions.item_type(this.env, completion_opts);
    this.env.smart_completions.set(completion);
    completion.chat_model = this.chat_model;
    await completion.init();
    
    const template_output = completion.response_text;

    // create a new note with the template output
    const new_note = await this.app.vault.create(`${this.template_item.name}-${Date.now()}.md`, template_output);

    // open the new note in new split
    const new_split = this.app.workspace.getLeaf('split', 'vertical');
    new_split.openFile(new_note);
  }
}
