/**
 * @file main.js
 * @description Example plugin entry with commands that call get_dynamic_template.
 */

import { Plugin, Notice } from "obsidian";
import { get_dynamic_template } from "./actions/get_dynamic_template.js";
import { parse_template } from "smart-templates/content_parsers/parse_templates.js";
import { SmartEnv } from "smart-environment/obsidian.js";
import { SmartTemplatesSettingTab } from "./settings_tab.js";
import { smart_completions } from "smart-completions";
import { smart_templates } from "smart-templates";
import { SmartTemplate } from "smart-templates";
import { TemplateSelectionModal } from "./template_selection_modal.js";
import { BuildContextModal } from "./build_context_modal.js";
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
        smart_templates
      },
      item_types: {
        SmartTemplate,
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

        const templateContent = await get_dynamic_template(source_item);
        if (templateContent === null) {
          new Notice("No matching template found.");
          return;
        }
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

  open_build_context_modal(template_item) {
    if(!this.build_context_modal) {
      this.build_context_modal = new BuildContextModal(this.app, this);
    }
    this.build_context_modal.open(template_item);
  }
  get_editor() {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (!activeLeaf || !activeLeaf.view || !activeLeaf.view.editor) {
      return null;
    }
    return activeLeaf.view.editor;
  }
}
