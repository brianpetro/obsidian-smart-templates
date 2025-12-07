// smart-templates-obsidian/src/modals/create_from_template_modal.js

/**
 * @file create_from_template_modal.js
 * @description
 * CreateFromTemplateModal extends the Smart Context selector modal to
 * add a "Build template prompt" action that:
 *  - lets the user pick a Smart Template
 *  - builds a full prompt using the current SmartContext and template
 *  - copies the prompt to the clipboard for use in any chat UI.
 */

import { Menu, Notice } from 'obsidian';
import { ContextModal } from 'obsidian-smart-env/src/modals/context_selector.js';
import { copy_to_clipboard } from 'obsidian-smart-env/utils/copy_to_clipboard.js';
import { build_prompt_text } from '../utils/build_prompt_text.js';

/**
 * @typedef {import('smart-contexts').SmartContext} SmartContext
 * @typedef {import('../items/smart_template.js').SmartTemplate} SmartTemplate
 */

/**
 * @class CreateFromTemplateModal
 * @extends ContextModal
 *
 * @example
 * // Example open helper (from a command):
 * const ctx = env.smart_contexts.new_context({}, { add_items });
 * CreateFromTemplateModal.open(ctx, {});
 */
export class CreateFromTemplateModal extends ContextModal {
  /** Modal identity and registration metadata */

  /** @returns {string} */
  static get modal_type() { return 'create_from_template'; }
  /** @returns {string} */
  static get display_text() { return 'Create from template'; }
  /** @returns {string} */
  static get event_domain() { return 'create_from_template'; }
  /** @returns {string} */
  static get command_id() { return this.modal_type; }
  /** @returns {string} */
  static get modal_key() { return 'create_from_template'; }
  /** @returns {string} */
  get modal_key() { return 'create_from_template'; }

  /**
   * @param {SmartContext} smart_context
   * @param {Object} [params={}]
   */
  constructor(smart_context, params = {}) {
    super(smart_context, params);
    this.params = params;
    this.smart_context = smart_context;

    /** @private */
    this._build_button_added = false;

    this._open_template_menu = this._open_template_menu.bind(this);
    this._build_and_copy_prompt = this._build_and_copy_prompt.bind(this);

    // Keep ContextModal instructions (add context, toggle block view, close)
    this.setInstructions([
      { command: 'Enter',     purpose: 'Add to context' },
      { command: '→ / ←',     purpose: 'Toggle block view' },
      { command: 'Esc',       purpose: 'Close' },
    ]);
  }

  /**
   * Override render to augment ContextModal UI with a new action button.
   *
   * @param {Object} [params=this.params]
   * @returns {Promise<void>}
   */
  async render(params = this.params) {
    await super.render(params);
    this._ensure_build_template_button();
  }

  /**
   * Ensures the "Build template prompt" button is attached once
   * into the context header actions container.
   *
   * @private
   */
  _ensure_build_template_button() {

    const build_btn = document.createElement('button');
    build_btn.textContent = 'Build template prompt';
    build_btn.addEventListener('click', this._open_template_menu);

    this.modalEl.prepend(build_btn);
  }

  /**
   * Returns an array of SmartTemplate items from the environment.
   *
   * @returns {SmartTemplate[]}
   * @private
   */
  _get_templates() {
    const collection = this.env?.smart_templates;
    if (!collection || !collection.items) return [];
    return Object.values(collection.items);
  }

  /**
   * Opens an Obsidian Menu listing available templates. On selection,
   * builds and copies the prompt to the clipboard.
   *
   * @param {MouseEvent | PointerEvent | KeyboardEvent} evt
   * @private
   */
  _open_template_menu(evt) {
    const templates = this._get_templates();
    if (!templates.length) {
      new Notice('No Smart Templates found.');
      return;
    }

    const menu = new Menu(this.app);

    templates.forEach((template_item) => {
      const label =
        template_item?.key ||
        template_item?.data?.key ||
        template_item?.data?.source_key ||
        'Untitled template';

      menu.addItem((item) => {
        item.setTitle(label);
        item.onClick(() => {
          this._build_and_copy_prompt(template_item);
        });
      });
    });

    // Try to anchor at mouse position when possible
    if (
      evt &&
      typeof MouseEvent !== 'undefined' &&
      evt instanceof MouseEvent
    ) {
      menu.showAtMouseEvent(evt);
    } else {
      // Fallback: center of the window
      menu.showAtPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
    }
  }

  /**
   * Builds the full prompt string from current SmartContext and the selected
   * SmartTemplate, then copies it to the clipboard.
   *
   * - Uses template.metadata.prompt (if present) as initial instructions.
   * - Delegates vault tag expansion and wrapping to build_prompt_text.
   *
   * @param {SmartTemplate} template_item
   * @returns {Promise<void>}
   * @private
   */
  async _build_and_copy_prompt(template_item) {
    try {
      if (!this.smart_context) {
        new Notice('No active context for building template prompt.');
        return;
      }
      if (!template_item) {
        new Notice('Template not found.');
        return;
      }

      const metadata = template_item.metadata || {};
      const instructions = metadata.prompt || '';

      const prompt_text = await build_prompt_text(
        this.smart_context,
        template_item,
        instructions
      );

      if (!prompt_text) {
        new Notice('Failed to build template prompt.');
        return;
      }

      await copy_to_clipboard(prompt_text);
      new Notice('Template prompt copied to clipboard!');
    } catch (err) {
      console.error('CreateFromTemplateModal: failed to build/copy prompt', err);
      new Notice('Failed to copy template prompt. See console for details.');
    }
  }

  /**
   * Optional helper: standard SmartFuzzySuggestModal registration.
   * This allows opening via env.events.emit('create_from_template:open', payload).
   *
   * @param {import('obsidian').Plugin} plugin
   * @returns {{event_domain: string}}
   */
  static register_modal(plugin) {
    // Inherit SmartFuzzySuggestModal.register_modal behavior
    return super.register_modal(plugin);
  }
}
