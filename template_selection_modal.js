/**
 * @file template_selection_modal.js
 * @description A modal for Smart Templates that allows the user to select a template.
 */

import { FuzzySuggestModal, Notice, setIcon } from 'obsidian';

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
    const context_items = Object.values(this.env.smart_templates.items);
    return context_items;
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
   * @param {import('obsidian').TFile} context_item
   */
  onChooseItem(context_item) {
    this.plugin.open_build_context_modal(context_item);
  }

  /**
   * Renders the 'pill' elements at the top of the modal for each selected file,
   * along with our action buttons.
   */
  render_pills() {
    // Remove the old button if any
    if (this.submit_btn) {
      this.submit_btn.remove();
    }
    // Build 'Build Context' submit button
    this.submit_btn = this.containerEl.createEl('button', { text: this.submit_btn_text });
    this.submit_btn.addEventListener('click', () => {
      this.submit();
    });

    // Insert them at top
    if (this.modalEl && this.submit_btn) {
      this.modalEl.prepend(this.submit_btn);
    }

    // Remove old container if any
    if (this.selected_container_el) {
      this.selected_container_el.remove();
    }
    this.selected_container_el = this.containerEl.createDiv('st-build-context-selected-container');
    if (this.modalEl && this.selected_container_el) {
      this.modalEl.prepend(this.selected_container_el);
    }

    // Create each pill
    for (const sel of this.selected_items) {
      const pill = this.selected_container_el.createDiv('st-build-context-pill');
      pill.createSpan({ text: sel.context_item.path });
      const remove_el = pill.createSpan({ text: '  ✕', cls: 'st-build-context-pill-remove' });
      remove_el.addEventListener('click', () => {
        this.selected_items = this.selected_items.filter(x => x !== sel);
        this.render_pills();
      });
      setIcon(pill.createSpan({ cls: 'st-build-context-pill-icon' }), 'document');
    }
  }

  /**
   * Insert linked files up to a certain depth from the current selection.
   * We'll do a BFS across the Obsidian metadataCache.
   * @param {number} depth
   */
  async insert_items_up_to_depth(depth) {
    // TODO
    console.log(`Inserting items up to depth=${depth}`);
  }


  /**
   * Final submission:
   *   - Gather the selected items
   *   - Pass them to the plugin's generation flow
   */
  async submit() {
    // Just gather final file paths
    const selectedPaths = this.selected_items.map(x => x.file.path);
    if (!selectedPaths.length) {
      new Notice('No files selected.');
      return;
    }
    // Here, you might proceed with the next step, e.g. calling:
    //    this.plugin.handleContextSelectionForTemplate(selectedPaths);
    // or you might copy them to clipboard. For now, we'll do a simple notice.
    new Notice(`Selected ${selectedPaths.length} file(s). Proceeding with template generation...`);

    // Example: just close modal
    this.close();
  }
}