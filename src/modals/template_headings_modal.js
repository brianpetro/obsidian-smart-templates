import { FuzzySuggestModal } from 'obsidian';
import {
  collect_block_heading_candidates,
  parse_template_headings,
  stringify_template_headings,
} from '../collections/smart_templates.js';

/**
 * Fuzzy modal to select headings for template block detection.
 */
export class TemplateHeadingsModal extends FuzzySuggestModal {
  /**
   * @param {import('obsidian').App} app
   * @param {object} params
   * @param {import('../collections/smart_templates.js').SmartTemplates} params.scope
   * @param {Function} [params.on_change]
   */
  constructor(app, params = {}) {
    super(app);
    this.params = params;
    this.scope = params.scope;
    this.on_change = params.on_change;
    this.headings = new Set(parse_template_headings(this.scope?.settings));
    this.setPlaceholder('Select a heading to include...');
  }

  open() {
    super.open();
    this.render_selected_headings();
  }

  getItems() {
    const blocks = Object.values(this.scope?.env?.smart_blocks?.items || {});
    const candidates = collect_block_heading_candidates(blocks);
    if (!candidates.length) {
      this.scope?.env?.events?.emit?.('templates:template_headings_missing', {
        level: 'warning',
        message: 'No headings detected in blocks.',
        event_source: 'template_headings_modal.getItems',
      });
    }
    return candidates;
  }

  getItemText(item) {
    return item;
  }

  onChooseItem(heading) {
    this.prevent_close = true;
    this.headings.add(heading);
    this.persist_selection();
    this.render_selected_headings();
    this.updateSuggestions();
  }

  persist_selection() {
    const csv = stringify_template_headings(Array.from(this.headings));
    if (this.scope?.settings) {
      this.scope.settings.template_headings = csv;
    }
    if (typeof this.on_change === 'function') {
      this.on_change(csv);
    }
  }

  render_selected_headings() {
    if (!this.modalEl) return;

    let header = this.modalEl.querySelector('.st-template-headings-header');
    if (!header) {
      header = this.modalEl.createEl('div', { cls: 'st-template-headings-header' });
      this.modalEl.prepend(header);
    }
    header.empty();

    const title = header.createEl('h3');
    title.setText('Selected headings');

    const headings = Array.from(this.headings);
    if (!headings.length) {
      header.createEl('p', { text: 'No headings selected.' });
      return;
    }

    const list = header.createEl('ul');
    headings.forEach((heading) => {
      const li = list.createEl('li');
      li.setText(heading + ' ');
      const remove_btn = li.createEl('button', { text: '(remove)' });
      remove_btn.addEventListener('click', () => {
        this.headings.delete(heading);
        this.persist_selection();
        this.render_selected_headings();
        this.updateSuggestions();
      });
    });
  }

  close() {
    setTimeout(() => {
      if (!this.prevent_close) super.close();
      this.prevent_close = false;
    }, 10);
  }
}
