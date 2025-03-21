/**
 * @file main.js
 * @description Example plugin entry with commands that call get_dynamic_template.
 */

import { Plugin, Notice } from "obsidian";
import { get_dynamic_templates } from "smart-templates/actions/get_dynamic_templates.js";
import { merge_templates } from "smart-templates/actions/merge_templates.js";
import { parse_template } from "smart-templates/content_parsers/parse_templates.js";
import { SmartEnv } from "obsidian-smart-env";
import { SmartTemplatesSettingTab } from "./settings_tab.js";
import { smart_completions, SmartCompletion } from "smart-completions";
import { smart_templates } from "smart-templates";
import { SmartTemplate } from "smart-templates";
import { TemplateSelectionModal } from "./modals/template_selection_modal.js";
import { BuildContextModal } from "./modals/build_context_modal.js";
import { UserMessageModal } from "./modals/user_message_modal.js";
import { smart_contexts } from "smart-contexts";
// chat model
import { SmartChatModel } from "smart-chat-model";
import {
  SmartChatModelAnthropicAdapter,
  SmartChatModelAzureAdapter,
  // SmartChatModelCohereAdapter,
  SmartChatModelCustomAdapter,
  SmartChatModelGeminiAdapter,
  SmartChatModelGroqAdapter,
  SmartChatModelLmStudioAdapter,
  SmartChatModelOllamaAdapter,
  SmartChatModelOpenaiAdapter,
  SmartChatModelOpenRouterAdapter,
} from "smart-chat-model/adapters.js";
import { SmartHttpRequest, SmartHttpObsidianRequestAdapter } from "smart-http-request";
import { requestUrl } from "obsidian";

export default class SmartTemplatesPlugin extends Plugin {
  onload() {
    // Initialize the environment, register commands, then register the settings tab
    SmartEnv.create(this, {
      // global_prop: window,
      global_prop: 'smart_env',
      collections: {
        smart_sources: {
          content_parsers: [parse_template],
        },
        // not is base obsidian smart-env
        smart_completions,
        smart_contexts,
        smart_templates
      },
      item_types: {
        SmartTemplate,
        SmartCompletion,
      },
      modules: {
        smart_chat_model: {
          class: SmartChatModel,
          // DEPRECATED FORMAT: will be changed (requires SmartModel adapters getters update)
          adapters: {
            anthropic: SmartChatModelAnthropicAdapter,
            azure: SmartChatModelAzureAdapter,
            custom: SmartChatModelCustomAdapter,
            gemini: SmartChatModelGeminiAdapter,
            groq: SmartChatModelGroqAdapter,
            lm_studio: SmartChatModelLmStudioAdapter,
            ollama: SmartChatModelOllamaAdapter,
            open_router: SmartChatModelOpenRouterAdapter,
            openai: SmartChatModelOpenaiAdapter,
          },
          http_adapter: new SmartHttpRequest({
            adapter: SmartHttpObsidianRequestAdapter,
            obsidian_request_url: requestUrl,
          }),
        },
      },
      default_settings: {
        smart_templates_plugin: {
          smart_completions: {
            chat_model: {
              platform_key: "openai",
            },
          },
        },
        smart_contexts: {
          smart_templates_plugin: {
            templates: {
              '-1': {
                before: '{{FILE_TREE}}'
              },
              '0': {
                before: '{{ITEM_PATH}}\n```{{ITEM_EXT}}',
                after: '```'
              },
              '1': {
                before: 'LINK: {{ITEM_NAME}}\n```{{ITEM_EXT}}',
                after: '```'
              },
            },
          },
        },
      },
    });
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
    // 1) Insert folder template
    this.addCommand({
      id: "insert_folder_template",
      name: "Insert folder template",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice("No active file.");
          return;
        }

        const source_item = this.env.smart_sources.get(file.path);

        const templates = await get_dynamic_templates(source_item);
        if (templates.length === 0) {
          new Notice("No matching template found.");
          return;
        }
        console.log('templates', templates);
        const templateContent = await merge_templates(templates);
        console.log('templateContent', templateContent);
        const editor = this.get_editor();
        if (!editor) return;
        editor.replaceSelection(templateContent + "\n");
        new Notice("Inserted folder template.");
      },
    });

    // // 2) Insert folder template (headings only)
    // this.addCommand({
    //   id: "insert_folder_template_headings",
    //   name: "Insert folder template (headings only)",
    //   callback: async () => {
    //     const file = this.app.workspace.getActiveFile();
    //     if (!file) {
    //       new Notice("No active file.");
    //       return;
    //     }
    //     const source_item = this.env.smart_sources.get(file.path);
    //     const content = await get_dynamic_template(source_item);
    //     if (content === null) {
    //       new Notice("No matching heading-only template found.");
    //       return;
    //     }
    //     const editor = this.get_editor();
    //     if (editor) {
    //       editor.replaceSelection(content + "\n");
    //       new Notice("Inserted headings-only template.");
    //     }
    //   },
    // });

    // 3) Generate from template
    this.addCommand({
      id: "generate_from_template",
      name: "Generate from template",
      callback: async () => {
        this.open_template_selection_modal();
      }
    });
    this.addCommand({
      id: "create_draft",
      name: "Create Draft",
      callback: async () => {
        this.create_draft();
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
