/**
 * @file user_message_modal.js
 * @description A modal that captures a user's message, then submits it to
 * smart_completions.create_or_update with user_message, template_key, and context_key.
 */

import { Modal, Notice } from 'obsidian';

/**
 * @class UserMessageModal
 * @extends Modal
 * @description Modal for user message submission
 */
export class UserMessageModal extends Modal {
  /**
   * @param {import('obsidian').App} app
   * @param {Object} plugin
   */
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.user_message = '';
    this.submit_btn_text = 'Submit';
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'User Message' });

    this.text_area_el = contentEl.createEl('textarea', {
      cls: 'user-message-textarea'
    });
    this.text_area_el.rows = 6;
    this.text_area_el.addEventListener('input', (evt) => {
      this.user_message = evt.target.value;
    });

    this.submit_btn = contentEl.createEl('button', {
      text: this.submit_btn_text,
      cls: 'mod-cta'
    });
    this.submit_btn.addEventListener('click', () => {
      this.submit_user_message();
    });
  }

  onClose() {
    this.contentEl.empty();
  }

  /**
   * Submits the user message to smart_completions with the current template_key and context_key.
   */
  async submit_user_message() {
    await this.plugin.generate_template();
    this.close();
  }
}
