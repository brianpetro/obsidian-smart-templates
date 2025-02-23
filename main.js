/**
 * @file main.js
 * @description Example plugin entry with commands that call get_dynamic_template.
 */

import { Plugin, Notice } from "obsidian";
import { get_dynamic_template } from "./actions/get_dynamic_template.js";

export default class SmartTemplatesPlugin extends Plugin {
  async onload() { this.app.workspace.onLayoutReady(this.initialize.bind(this)); } // initialize when layout is ready
  async initialize() {
    await SmartEnv.create(this, {
      // global_ref: window,
      global_prop: 'smart_env',
      collections: {},
      item_types: {},
      modules: {},
      ...this.smart_env_config,
    });
    this.register_commands();
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

        // Retrieve the source_item from a hypothetical collection
        // If you have env.smart_sources or something similar, you might do:
        // const source_item = env.smart_sources.get(file.path);
        // Or store it in a local helper.
        const source_item = {
          path: file.path,
          collection: { fs: this.smart_env.fs },  // adapt if needed
          env: this.smart_env,  // ensure you have a reference to your environment
        };

        const templateContent = await get_dynamic_template({ source_item });
        if (templateContent === "No matching template.") {
          new Notice("No matching template found.");
          return;
        }
        // Insert content
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
        // Possibly override env.smart_templates.settings.template_heading = "template" or something
        // Then do same steps as above. This is just an example:
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
                template_heading: "template", // or user setting
                // maybe merge_parent_templates: true, etc.
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
    //    In a real plugin, you'd open a modal to pick from multiple templates, etc.
    this.addCommand({
      id: "generate_from_template",
      name: "Generate from template",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice("No active file open.");
          return;
        }

        // Possibly show a modal to pick from known templates, but here is a simple example:
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
        // You could create a new note or insert at cursor, etc.
        // For demonstration, let's just insert in the current editor:
        const editor = this.get_editor();
        if (editor) {
          editor.replaceSelection(content + "\n");
          new Notice("Generated from template.");
        }
      }
    });
  }

  get_editor() {
    const leaf = this.app.workspace.getActiveViewOfType(this.app.plugins.getPlugin("editor")?.viewClass);
    // Or simpler: if you're certain you can do:
    const activeLeaf = this.app.workspace.activeLeaf;
    if (!activeLeaf || !activeLeaf.view || !activeLeaf.view.editor) {
      return null;
    }
    return activeLeaf.view.editor;
  }
}
