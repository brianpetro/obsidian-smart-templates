/**
 * @file main.js
 * @description Main entrypoint for the "Smart Templates" Obsidian Plugin (ESM).
 *
 * Uses "smart-environment" in place of "obsidian-smart-env":
 *   SmartEnv.waitFor({ loaded: true }).then(() => {
 *     this.env = SmartEnv.create(this.smart_env_config);
 *     ...
 *   });
 */

import { Plugin, Notice } from "obsidian";
import { SmartEnv } from "smart-environment/obsidian.js";

export default class SmartTemplatesPlugin extends Plugin {
  /**
   * Example environment config. Adjust to your needs.
   * @type {Object}
   */
  smart_env_config = {
    collections: {},
    items: {},
    modules: {},
  };

  async initialize() {
    console.log("Loading Smart Templates plugin...");

    await SmartEnv.create(this, {
      // global_ref: window,
      global_prop: 'smart_env',
      collections: {},
      item_types: {},
      modules: {},
      ...this.smart_env_config,
    });
    this.register_commands();
  }

  async onload() { this.app.workspace.onLayoutReady(this.initialize.bind(this)); } // initialize when layout is ready
  onunload() {
    console.log("Unloading Smart Templates plugin...");
    if (this.env && typeof this.env.unload_main === "function") {
      this.env.unload_main("smart_templates" + "_plugin");
    }
  }

  /**
   * Register plugin commands.
   */
  register_commands() {
    this.addCommand({
      id: "say-hello-smart-templates",
      name: "Say Hello (Smart Templates)",
      callback: () => {
        new Notice(`Hello from Smart Templates plugin!`);
      }
    });
  }
}
