/**
 * @file main.js
 * @description Example plugin entry with commands that call get_dynamic_template.
 */

import { Plugin, Notice } from "obsidian";
import { get_dynamic_template } from "./actions/get_dynamic_template.js";
import { parse_template } from "./actions/source_content_parser.js";
import { SmartEnv } from "smart-environment/obsidian.js";
import { SmartTemplatesSettingTab } from "./settings_tab.js";

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
      },
    });

    this.register_commands();
    // Register the new Smart Templates settings tab
    this.addSettingTab(new SmartTemplatesSettingTab(this.app, this));

    console.log("Smart Templates plugin loaded.");
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

        const source_item = {
          path: file.path,
          collection: { fs: this.smart_env.fs },
          env: this.smart_env,
        };

        const templateContent = await get_dynamic_template({ source_item });
        if (templateContent === "No matching template.") {
          new Notice("No matching template found.");
          return;
        }
        const editor = this.get_editor();
        if (!editor) return;
        editor.replaceSelection(templateContent + "\n");
        new Notice("Inserted folder template.");
      },
    });

    // 2) Insert folder template (headings only)
    this.addCommand({
      id: "insert_folder_template_headings",
      name: "Insert folder template (headings only)",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice("No active file.");
          return;
        }
        const source_item = {
          path: file.path,
          collection: { fs: this.smart_env.fs },
          env: {
            smart_templates: {
              settings: {
                template_heading: "template"
              }
            }
          }
        };
        const content = await get_dynamic_template({ source_item });
        if (content === "No matching template.") {
          new Notice("No matching heading-only template found.");
          return;
        }
        const editor = this.get_editor();
        if (editor) {
          editor.replaceSelection(content + "\n");
          new Notice("Inserted headings-only template.");
        }
      },
    });

    // 3) Generate from template
    this.addCommand({
      id: "generate_from_template",
      name: "Generate from template",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice("No active file open.");
          return;
        }

        const source_item = {
          path: file.path,
          collection: { fs: this.smart_env.fs },
          env: this.smart_env
        };
        const content = await get_dynamic_template({ source_item });
        if (content === 'No matching template.') {
          new Notice("No matching template found.");
          return;
        }
        const editor = this.get_editor();
        if (editor) {
          editor.replaceSelection(content + "\n");
          new Notice("Generated from template.");
        }
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
}
