import { FuzzySuggestModal, Notice } from 'obsidian';
import {
  collect_template_folder_candidates,
  parse_template_folders,
  stringify_template_folders,
} from '../collections/smart_templates.js';

/**
 * Fuzzy modal to select a folder for template discovery.
 */
export class TemplateFolderModal extends FuzzySuggestModal {
  /**
   * @param {import('obsidian').App} app
   * @param {Object} params
   * @param {import('../collections/smart_templates.js').SmartTemplates} params.scope
   * @param {Function} [params.on_change]
   */
  constructor(app, params = {}) {
    super(app);
    this.params = params;
    this.scope = params.scope;
    this.on_change = params.on_change;
    this.folders = new Set(parse_template_folders(this.scope?.settings));
    this.setPlaceholder('Select a folder to import templates from...');
  }

  getItems() {
    const sources = Object.values(this.scope?.env?.smart_sources?.items || {});
    const folders = collect_template_folder_candidates(sources);
    if (!folders.length) {
      new Notice('No folders detected in sources.');
    }
    return folders;
  }

  getItemText(folder) {
    return folder;
  }

  onChooseItem(folder) {
    this.prevent_close = true;
    this.folders.add(folder);
    this.persist_selection();
    this.render_selected_folders();
    this.updateSuggestions();
  }

  persist_selection() {
    const csv = stringify_template_folders(Array.from(this.folders));
    if (typeof this.on_change === 'function') {
      this.on_change(csv);
    }
  }

  render_selected_folders() {
    if (!this.modalEl) return;
    let header = this.modalEl.querySelector('.st-template-folders-header');
    if (!header) {
      header = this.modalEl.createEl('div', { cls: 'st-template-folders-header' });
      this.modalEl.prepend(header);
    }
    header.empty();

    const title = header.createEl('h3');
    title.setText('Selected folders');

    const folders = Array.from(this.folders);
    if (!folders.length) {
      header.createEl('p', { text: 'No folders selected.' });
      return;
    }

    const list = header.createEl('ul');
    folders.forEach(folder => {
      const li = list.createEl('li');
      li.setText(folder + ' ');
      const remove_btn = li.createEl('button', { text: '(remove)' });
      remove_btn.addEventListener('click', () => {
        this.folders.delete(folder);
        this.persist_selection();
        this.render_selected_folders();
        this.updateSuggestions();
      });
    });
  }

  open() {
    super.open();
    this.render_selected_folders();
  }

  close() {
    setTimeout(() => {
      if (!this.prevent_close) super.close();
      this.prevent_close = false;
    }, 10);
  }
}
