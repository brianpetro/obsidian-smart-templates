import { Modal, Notice } from 'obsidian';
import { copy_to_clipboard } from 'smart-context-obsidian/src/utils/copy_to_clipboard.js';
import { insert_output } from '../utils/insert_output.js';
import { replace_vault_tags_var } from 'smart-context-obsidian/src/utils/replace_vault_tags_var.js';
import { run_template_completion } from '../utils/run_template_completion.js';

/**
 * @typedef {import('smart-contexts').SmartContext} SmartContext
 * @typedef {import('../items/smart_template.js').SmartTemplate} SmartTemplate
 */

export class TemplateReviewModal extends Modal {
  /**
   * @param {import('obsidian').Plugin} plugin
   * @param {Object}                    opts
   * @param {SmartContext}              opts.ctx
   * @param {SmartTemplate}             opts.template
   * @param {string}                    [opts.user_message='']
   */
  constructor(plugin, opts = {}) {
    super(plugin.app);
    this.plugin = plugin;
    this.opts = opts;

    /** injected by Smart‑Env */
    this.plugin.env.create_env_getter(this);

    /** @type {string} – holds streamed completion */
    this._output_text = '';

    /** @type {import('smart-completions').SmartCompletion} */
    this.completion = null;

    /* bind instance methods */
    this._generate_output      = this._generate_output.bind(this);
    this._update_output        = this._update_output.bind(this);
    this._insert_output        = this._insert_output.bind(this);
    this._create_file          = this._create_file.bind(this);
    this._copy_output_clipboard = this._copy_output_clipboard.bind(this);
  }

  /**
   * Convenience wrapper to avoid `new` at call‑site.
   *
   * @param {import('obsidian-smart-env').SmartEnv} env
   * @param {Object}                                opts
   * @returns {TemplateReviewModal}
   */
  static open(env, opts = {}) {
    const plugin =
      env.smart_templates_plugin   ||
      // env.smart_context_plugin   ||
      // env.smart_chat_plugin       ||
      // env.smart_connections_plugin||
      env.plugin;
    if (!env.template_review_modal) {
      env.template_review_modal = new this(plugin, opts);
    }
    env.template_review_modal.opts = opts;
    env.template_review_modal.open();
    return env.template_review_modal;
  }

  /**
   * Forward any fresh opts then reopen the modal.
   *
   * @param {Object} opts
   */
  open(opts = this.opts) {
    this.opts = opts;
    super.open();
  }

  onOpen() {
    this._render_modal();
    this._generate_output().catch(err => {
      console.error('Template generation error:', err);
      new Notice('Template generation failed. See console for details.');
    });
  }

  onClose() { this.contentEl.empty(); }

  _render_modal() {
    this.setTitle('Smart Templates');

    const el = this.contentEl;
    el.empty();
    el.classList.add('st-template-review-modal');

    /* live preview */
    this.output_el = el.createEl('pre', {
      cls  : 'st-template-output',
      text : '⏳ Generating template…'
    });

    /* actions */
    const actions_el = el.createDiv({ cls: 'st-actions' });

    /** Insert into current editor */
    this.insert_btn = actions_el.createEl('button', { text: 'Insert' });
    /** Create new file */
    this.create_btn = actions_el.createEl('button', { text: 'Create' });
    /** NEW: copy to clipboard */
    this.copy_btn = actions_el.createEl('button', { text: 'Copy' });

    this.insert_btn.disabled = true;
    this.create_btn.disabled = true;
    this.copy_btn.disabled   = true;

    this.insert_btn.addEventListener('click', this._insert_output);
    this.create_btn.addEventListener('click', this._create_file);
    this.copy_btn.addEventListener('click', this._copy_output_clipboard);
  }

  get user_message() {
    let user_message = this.opts.user_message || '';
    if (user_message.includes("{{vault_tags}}")) {
      user_message = replace_vault_tags_var(user_message);
    }
    return user_message;
  }
  async _generate_output() {
    const { ctx, template } = this.opts;
    if (!ctx || !template) {
      throw new Error('ctx and template are required.');
    }

    this.completion = await run_template_completion(
      this.env,
      template,
      ctx.key,
      this.user_message,
      {
        chunk : c => {
          this._output_text = c.response_text;
          this._update_output(false);
        },
        done  : c => {
          this._output_text = c.response_text;
          this._update_output(true);
        },
        error : err => {
          console.error('stream error', err);
          new Notice('Streaming error – see console.');
        }
      },
      this.opts.chat_thread
    );
  }

  /**
   * Replace preview text and toggle action buttons when finished.
   *
   * @param {boolean} finalised
   */
  _update_output(finalised = false) {
    if (this.output_el) this.output_el.setText(this._output_text);
    if (finalised) {
      this.insert_btn.disabled = false;
      this.create_btn.disabled = false;
      this.copy_btn.disabled   = false;
    }
  }

  /** Insert into current editor then close modal. */
  _insert_output() {
    const editor = this.plugin.get_editor?.();
    if (!editor) {
      new Notice('No active editor.');
      return;
    }

    const doc_text    = editor.getValue();
    const cursor_pos  = editor.getCursor();
    const updated_doc = insert_output(
      doc_text,
      cursor_pos.line,
      this._output_text.trim()
    );

    editor.setValue(updated_doc);
    this.close();
  }

  /** Create new note with content then open it in a vertical split. */
  async _create_file() {
    try {
      const current_file = this.app.workspace.getActiveFile();
      const curr_file_name = current_file ? current_file.basename : 'Template Output';
      const name = `${curr_file_name}-${Date.now()}.md`;
      const file = await this.app.vault.create(name, this._output_text);
      const leaf = this.app.workspace.getLeaf('split', 'vertical');
      await leaf.openFile(file);
    } catch (err) {
      console.error(err);
      new Notice('Failed to create note.');
    } finally {
      this.close();
    }
  }

  /** Copy the generated output to system clipboard. */
  async _copy_output_clipboard() {
    if (!this._output_text) return;
    await copy_to_clipboard(this._output_text);
    new Notice('Template copied to clipboard!');
  }
}
