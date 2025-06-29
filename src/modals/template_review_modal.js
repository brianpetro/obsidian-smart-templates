/**
 * TemplateReviewModal
 *
 * Streams a SmartCompletion into a live preview then lets the user
 * insert it at the current cursor or create a new note.
 *
 * @module TemplateReviewModal
 */

import { Modal, Notice } from 'obsidian';

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

    /** @type {string} */
    this._output_text = '';
    /** @type {import('smart-completions').SmartCompletion} */
    this.completion = null;

    /* bind instance methods */
    this._generate_output = this._generate_output.bind(this);
    this._update_output   = this._update_output.bind(this);
    this._insert_output   = this._insert_output.bind(this);
    this._create_file     = this._create_file.bind(this);
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
      env.smart_contexts_plugin ||
      env.smart_chat_plugin      ||
      env.smart_connections_plugin ||
      env.plugin;
    if (!env.template_review_modal) {
      env.template_review_modal = new this(plugin, opts);
    }
    env.template_review_modal.open(opts);
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

  onClose() {
    this.contentEl.empty();
  }

  _render_modal() {
    this.setTitle('Smart Templates');
    const el = this.contentEl;
    el.empty();
    el.classList.add('st-template-review-modal');

    /* live preview */
    this.output_el = el.createEl('pre', {
      cls  : 'st-template-output',
      text : '⏳ Generating template…',
    });

    /* actions */
    const actions_el = el.createDiv({ cls: 'st-actions' });

    this.insert_btn = actions_el.createEl('button', { text: 'Insert' });
    this.create_btn = actions_el.createEl('button', { text: 'Create' });

    this.insert_btn.disabled = true;
    this.create_btn.disabled = true;

    this.insert_btn.addEventListener('click', this._insert_output);
    this.create_btn.addEventListener('click', this._create_file);
  }

  async _generate_output() {
    const { ctx, template, user_message = '' } = this.opts;
    if (!ctx || !template) {
      throw new Error('ctx and template are required.');
    }

    /* build a SmartCompletion */
    const completion_opts = {
      key          : `${Date.now()}-${template.key}`,
      context_key  : ctx.key,
      template_key : template.key,
      user_message,
    };
    const Completion = this.env.smart_completions.item_type;
    this.completion  = new Completion(this.env, completion_opts);
    this.env.smart_completions.set(this.completion);

    /* attach chat_model (same lazy getter as plugin.generate_template) */
    this.completion.chat_model =
      this.plugin.chat_model ??
      this.plugin.env?.smart_templates_plugin?.chat_model ??
      null;

    await this.completion.init({
      stream          : true,
      stream_handlers : {
        chunk : (c) => {
          this._output_text = c.response_text;
          this._update_output(false);
        },
        done  : (c) => {
          this._output_text = c.response_text;
          this._update_output(true);
        },
        error : (err) => {
          console.error('stream error', err);
          new Notice('Streaming error – see console.');
        },
      },
    });
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
    }
  }

  /** Insert into current editor then close modal. */
  _insert_output() {
    const editor = this.plugin.get_editor?.();
    if (!editor) {
      new Notice('No active editor.');
      return;
    }
    editor.replaceSelection(this._output_text);
    this.close();
  }

  /** Create new note with content then open it in a vertical split. */
  async _create_file() {
    try {
      const name = `${this.opts.template.name}-${Date.now()}.md`;
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
}
