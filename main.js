/**
 * @file main.js
 * @description Example plugin entry with commands that call get_dynamic_template.
 */

import { Plugin, Notice } from "obsidian";
import { get_dynamic_templates } from "smart-templates/actions/get_dynamic_templates.js";
import { merge_templates } from "smart-templates/actions/merge_templates.js";
import { parse_template } from "smart-templates/content_parsers/parse_templates.js";
import { SmartEnv } from "smart-environment/obsidian.js";
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
  async onload() {
    this.app.workspace.onLayoutReady(this.initialize.bind(this));
  }

  async initialize() {
    // Initialize the environment, register commands, then register the settings tab
    await SmartEnv.create(this, {
      // global_prop: window,
      global_prop: 'smart_env',
      collections: {
        smart_sources: {
          content_parsers: [parse_template],
        },
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
        smart_completions: {
          chat_model: {
            platform_key: "openai",
          },
        },
      },
    });
    await SmartEnv.wait_for({loaded: true});
    this.notices = new this.env.config.modules.smart_notices.class(this);
    this.env.smart_sources.process_source_import_queue({process_embed_queue: false, import_all: true});

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
  }
  open_template_selection_modal() {
    if(!this.template_selection_modal) {
      this.template_selection_modal = new TemplateSelectionModal(this.app, this);
    }
    this.template_selection_modal.open();
  }

  open_build_context_modal() {
    if(!this.build_context_modal) {
      this.build_context_modal = new BuildContextModal(this.app, this);
    }
    this.build_context_modal.open();
  }
  open_user_message_modal() {
    if(!this.user_message_modal) {
      this.user_message_modal = new UserMessageModal(this.app, this);
    }
    this.user_message_modal.open();
  }
  get_editor() {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (!activeLeaf || !activeLeaf.view || !activeLeaf.view.editor) {
      return null;
    }
    return activeLeaf.view.editor;
  }
  async generate_template() {
    const template_output = await this.template_item.generate_template_output(this.context_item.key);

    // create a new note with the template output
    const new_note = await this.app.vault.create(`${this.template_item.name}-${Date.now()}.md`, template_output);

    // open the new note in new split
    const new_split = this.app.workspace.getLeaf('split', 'vertical');
    new_split.openFile(new_note);
  }
}
