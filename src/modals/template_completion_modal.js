import { Modal, Notice } from 'obsidian';
import { ContextSelectorModal } from 'smart-context-obsidian/src/views/context_selector_modal.js';
import { TemplateReviewModal } from './template_review_modal.js';

export class TemplateCompletionModal extends Modal {
  /**
   * @param {import('obsidian').App}     app
   * @param {import('../../main.js').default} plugin
   */
  constructor(plugin, opts = {}) {
    super(plugin.app);
    this.plugin = plugin;
    this.opts = opts;
    /** inject env getter */
    this.plugin.env.create_env_getter(this);
    this.user_message = '';
    this.context = opts.ctx || null;
    this.template = opts.template || null;
  }
  static open(env, opts = {}) {
    const plugin =
      env.smart_contexts_plugin ||
      env.smart_chat_plugin ||
      env.smart_connections_plugin ||
      env.plugin
    ;
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
    console.log('TemplateCompletionModal opened with opts:', this, this.opts);
    this.setTitle('Template: ' + (this.opts?.template?.key || 'MISSING TEMPLATE'));
  }
  async render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.classList.add('st-template-completion-modal');

    if (!this.context) {
      const active_file = this.app.workspace.getActiveFile();
      const add_items   = active_file ? [active_file.path] : [];
      this.context = this.env.smart_contexts.new_context({}, { add_items });
    }
    const ctx = this.context;

    const ctx_container = await this.env.render_component(
      'context_builder',
      ctx,
      {
        update_callback : (_ctx) => { this.context = _ctx; },
      }
    );
    ctx_container.style.maxHeight = '50vh';
    ctx_container.style.overflowY = 'auto';
    contentEl.appendChild(ctx_container);

    const header_actions = ctx_container.querySelector('.sc-context-actions');
    const edit_btn       = document.createElement('button');
    edit_btn.textContent = 'Edit context';
    // plugin.ContextSelectorModal is early-release if available
    const ContextSelectorModalClass = this.env.smart_context_plugin?.ContextSelectorModal || ContextSelectorModal;
    edit_btn.addEventListener('click', () =>
      ContextSelectorModalClass.open(this.env, {
        ctx,
        update_callback : (_ctx) => {
          console.log('Template modal context updated:', _ctx);
          this.context = _ctx;
          this.render(); // re-render to reflect context changes
        },
      })
    );
    header_actions.appendChild(edit_btn);

    this.textarea_el = contentEl.createEl('textarea', {
      cls  : 'st-user-message-input',
      attr : {
        rows : '6',
        placeholder : 'Additional instructions (optional)',
        style : 'width: 100%;',
      },
    });
    if(this.user_message) {
      this.textarea_el.value = this.user_message;
    }else if (this.template.metadata?.prompt) {
      // pre-fill with template prompt if available
      this.textarea_el.value = this.template.metadata.prompt;
      this.user_message = this.textarea_el.value;
    }
    this.textarea_el.addEventListener('input', (e) => {
      this.user_message = e.target.value;
    });

    const actions_el = contentEl.createDiv({ cls : 'st-actions' });

    const complete_btn = actions_el.createEl('button', { text : 'Complete' });
    complete_btn.classList.add('mod-cta');
    complete_btn.addEventListener('click', async () => {
      TemplateReviewModal.open(this.env, {
        ctx : this.context,
        user_message : this.user_message,
        template : this.opts.template,
      });
      this.close();
    });
  }

  onClose() { this.contentEl.empty(); }


}