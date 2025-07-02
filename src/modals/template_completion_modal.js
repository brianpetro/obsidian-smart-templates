import { Modal, Notice } from 'obsidian';
import { ContextSelectorModal } from 'smart-context-obsidian/src/views/context_selector_modal.js';
import { TemplateReviewModal } from './template_review_modal.js';
import { copy_to_clipboard } from 'smart-context-obsidian/src/utils/copy_to_clipboard.js';
import { build_prompt_text } from '../utils/build_prompt_text.js';

export class TemplateCompletionModal extends Modal {
  constructor(plugin, opts = {}) {
    super(plugin.app);
    this.plugin = plugin;
    this.opts = opts;
    this.plugin.env.create_env_getter(this);

    this.user_message = '';

    /* bind for listeners */
    this._copy_prompt_clipboard = this._copy_prompt_clipboard.bind(this);
  }

  static open(env, opts = {}) {
    const plugin =
      env.smart_context_plugin ||
      env.smart_chat_plugin ||
      env.smart_connections_plugin ||
      env.plugin;

    if (!env.template_completion_modal) {
      env.template_completion_modal = new this(plugin, opts);
    }
    env.template_completion_modal.opts = opts;
    env.template_completion_modal.user_message = opts.user_message || '';
    env.template_completion_modal.open();
    return env.template_completion_modal;
  }

  onOpen() {
    this.render();
    this.setTitle('Template: ' + (this.opts?.template?.key || 'MISSING TEMPLATE'));
  }
  get context() { return this.opts.ctx || this.env.smart_templates.current_context; }
  get template() { return this.opts.template; }

  async render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.classList.add('st-template-completion-modal');

    /* ensure context */
    const ctx_container = await this.env.render_component('context_builder', this.context, {
      update_callback: (_ctx) => {
        this.opts.context = _ctx;
      },
    });
    ctx_container.style.maxHeight = '50vh';
    ctx_container.style.overflowY = 'auto';
    contentEl.appendChild(ctx_container);

    const header_actions = ctx_container.querySelector('.sc-context-actions');
    const edit_btn = document.createElement('button');
    edit_btn.textContent = 'Edit context';
    edit_btn.addEventListener('click', () =>
      ContextSelectorModal.open(this.env, {
        ctx: this.context,
        update_callback: (_ctx) => {
          this.opts.context = _ctx;
          this.render();
        },
      }),
    );
    header_actions.appendChild(edit_btn);

    /* user instructions textarea */
    this.textarea_el = contentEl.createEl('textarea', {
      cls: 'st-user-message-input',
      attr: { rows: '6', placeholder: 'Additional instructions (optional)', style: 'width: 100%;' },
    });
    if (this.user_message) {
      this.textarea_el.value = this.user_message;
    } else if (this.template.metadata?.prompt) {
      // pre-fill with template prompt if available
      this.textarea_el.value = this.template.metadata.prompt;
      this.user_message = this.textarea_el.value;
    }
    this.textarea_el.addEventListener('input', (e) => {
      this.user_message = e.target.value;
    });

    /* actions */
    const actions_el = contentEl.createDiv({ cls: 'st-actions' });

    const copy_btn = actions_el.createEl('button', { text: 'Copy as prompt' });
    copy_btn.addEventListener('click', this._copy_prompt_clipboard);

    const complete_btn = actions_el.createEl('button', { text: 'Complete' });
    complete_btn.classList.add('mod-cta');
    complete_btn.addEventListener('click', async () => {
      TemplateReviewModal.open(this.env, {
        ctx: this.context,
        user_message: this.user_message,
        template: this.opts.template,
      });
      this.close();
    });

  }

  async _copy_prompt_clipboard() {
    try {
      const prompt_text = await build_prompt_text(this.context, this.template, this.user_message);
      await copy_to_clipboard(prompt_text);
      new Notice('Prompt copied to clipboard!');
      this.close();
    } catch (err) {
      console.error('Failed to copy prompt:', err);
      new Notice('Copy failed – see console.');
    }
  }

  onClose() {
    this.contentEl.empty();
    this.user_message = '';
    this.env.smart_templates.current_context = null;
  }
}
