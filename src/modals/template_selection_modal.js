/**
 * @file template_selection_modal.js
 * @description A modal for Smart Templates that allows the user to select a template.
 */

import { FuzzySuggestModal } from 'obsidian';

/**
 * @typedef {Object} SelectedItem
 * @property {import('obsidian').TFile} file
 */

/**
 * TemplateSelectionModal
 * Allows the user to select a template.
 */
export class TemplateSelectionModal extends FuzzySuggestModal {
  /**
   * @param {import('obsidian').App} app - The Obsidian app
   * @param {Object} plugin - The main Smart Templates plugin
   */
  constructor(app, plugin, ) {
    super(app);
    this.plugin = plugin;
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
  onChooseItem(template_item) {
    console.log('onChooseItem', template_item);
    this.plugin.template_item = template_item;
    this.plugin.open_template_completion_modal();
    this.close();
  }

  // no pills rendering – context builder used instead
}