import { SmartEnv, merge_env_config, SmartPlugin } from "obsidian-smart-env";
import { SmartTemplatesSettingTab } from "./settings_tab.js";
import { smart_env_config } from './smart_env.config.js';
import { default_templates } from "./src/defaults/default_templates.js";
import {CreateFromTemplateModal} from "./src/modals/create_from_template_modal.js";

const default_config = {
  modals: {
    create_from_template: {
      class: CreateFromTemplateModal,
      default_suggest_action_keys: [
        'context_suggest_sources',
      ]
    },
  },
}

export default class SmartTemplatesPlugin extends SmartPlugin {
  compiled_smart_env_config = smart_env_config;
  onload() {
    SmartEnv.create(this, merge_env_config(this.compiled_smart_env_config, default_config));
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

    this.add_default_templates();

    // adds listener to open via event
    CreateFromTemplateModal.register_modal(this);

  }

  register_commands() {

    this.addCommand({
      id: 'create-from-template',
      name: 'Create from template (copy prompt to clipboard)',
      callback: () => {
        const ctx = this.env.smart_contexts.new_context();
        // Open the modal bound to this new SmartContext
        ctx.emit_event('create_from_template:open');
      },
    });
  }
  add_default_templates() {
    for (const template of default_templates) {
      this.env.smart_templates.create_or_update(template);
    }
  }
  get_editor() {
    const active_editor = this.app.workspace.activeEditor?.editor;
    if (!active_editor) {
      return null;
    }
    return active_editor;
  }
}