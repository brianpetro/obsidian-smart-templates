/**
 * @file template_selection_modal.js
 * @description A modal for Smart Templates that allows the user to select a template.
 */

import { FuzzySuggestModal } from 'obsidian';
import { TemplateCompletionModal } from './template_completion_modal.js';

/**
 * @typedef {Object} SelectedItem
 * @property {import('obsidian').TFile} file
 */

/**
 * TemplateSelectorModal
 * Allows the user to select a template.
 */
export class TemplateSelectorModal extends FuzzySuggestModal {
  static open(env, opts = {}) {
    const plugin =
      env.smart_templates_plugin   ||
      // env.smart_context_plugin ||
      // env.smart_chat_plugin ||
      // env.smart_connections_plugin ||
      env.plugin
    ;
    if (!env.template_selector_modal) {
      env.template_selector_modal = new this(plugin, opts);
    }
    env.template_selector_modal.opts = opts;
    env.template_selector_modal.open();
    return env.template_selector_modal;
  }
  /**
   * @param {import('obsidian').App} app - The Obsidian app
   * @param {Object} plugin - The main Smart Templates plugin
   */
  constructor(plugin, opts = {}) {
    super(plugin.app);
    this.plugin = plugin;
    this.opts = opts;
    this.setInstructions([
      { command: 'Enter', purpose: 'Select Template' },
      { command: 'Esc', purpose: 'Close' }
    ]);
    this.plugin.env.create_env_getter(this); // sets this.env
  }

  /**
   * Returns all .md files from the vault except those already selected.
   * FuzzySuggestModal uses this array for suggestions.
   */
  getItems() {
    return Object.values(this.env.smart_templates.items);
  }

  /**
   * The text displayed in each suggestion row.
   * @param {import('obsidian').TFile} file
   * @returns {string}
   */
  getItemText(item) {
    return item.key;
  }

  /**
   * Called when the user selects an item from the suggestions.
   * We do not close the modal. Instead, we store the selection and re-render.
   */
  onChooseItem(selection, evt) {
    TemplateCompletionModal.open(
      this.env,
      {
        template: selection,
      }
    );
    this.close();
  }

}