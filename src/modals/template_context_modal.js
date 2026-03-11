import { Notice } from 'obsidian';
import { ContextModal } from 'obsidian-smart-env/src/modals/context_selector.js';

const DEFAULT_REQUEST_STATE = Object.freeze({
  mode: 'copy_prompt',
  selected_template_key: null,
  user_message: '',
  preferred_output_target: null,
});

const SUPPORTED_REQUEST_MODES = new Set([
  'copy_prompt',
  'generate',
]);

/**
 * Clone and normalize request state.
 *
 * @param {object} [request_state={}]
 * @returns {{
 *   mode: string,
 *   selected_template_key: string | null,
 *   user_message: string,
 *   preferred_output_target: string | null
 * }}
 */
function create_request_state(request_state = {}) {
  const next_request_state = {
    ...DEFAULT_REQUEST_STATE,
    ...(request_state || {}),
  };

  if (!SUPPORTED_REQUEST_MODES.has(next_request_state.mode)) {
    next_request_state.mode = DEFAULT_REQUEST_STATE.mode;
  }

  next_request_state.selected_template_key =
    typeof next_request_state.selected_template_key === 'string' &&
    next_request_state.selected_template_key.trim().length
      ? next_request_state.selected_template_key
      : null
  ;

  next_request_state.user_message =
    typeof next_request_state.user_message === 'string'
      ? next_request_state.user_message
      : ''
  ;

  next_request_state.preferred_output_target =
    typeof next_request_state.preferred_output_target === 'string' &&
    next_request_state.preferred_output_target.trim().length
      ? next_request_state.preferred_output_target
      : null
  ;

  return next_request_state;
}

/**
 * Resolve the template metadata prompt fallback.
 *
 * @param {object | null} template_item
 * @returns {string}
 */
function get_default_user_message(template_item) {
  const metadata_prompt = template_item?.metadata?.prompt;
  if (typeof metadata_prompt !== 'string') {
    return '';
  }

  return metadata_prompt.trim();
}

export class TemplateContextModal extends ContextModal {
  static get modal_type() { return 'template_context'; }
  static get display_text() { return 'Template context'; }
  static get event_domain() { return 'template_context'; }
  static get command_id() { return this.modal_type; }
  static get modal_key() { return 'template_context'; }
  get modal_key() { return 'template_context'; }

  /**
   * @param {import('smart-contexts').SmartContext} smart_context
   * @param {object} [params={}]
   */
  constructor(smart_context, params = {}) {
    super(smart_context, params);

    this.smart_context = smart_context;
    this.params = { ...params };

    this.request_state = create_request_state(params);
    this.selected_template_key = this.request_state.selected_template_key;
    this.request_panel_el = null;
    this.request_panel_render_id = 0;

    this.context_default_suggest_action_keys = Array.isArray(this.default_suggest_action_keys)
      ? [...this.default_suggest_action_keys]
      : ['context_suggest_sources']
    ;
  }

  sync_request_state_from_params(params = {}) {
    this.request_state = create_request_state({
      ...this.request_state,
      ...(params || {}),
    });
    this.selected_template_key = this.request_state.selected_template_key;
  }

  async render(params = this.params) {
    this.sync_request_state_from_params(params);
    await super.render(params);
    await this.render_request_panel();
  }

  onClose() {
    this.request_panel_render_id += 1;
    if (this.request_panel_el?.isConnected) {
      this.request_panel_el.remove();
    }
    this.request_panel_el = null;
    super.onClose();
  }

  set_selected_template_key(template_key) {
    this.request_state.selected_template_key =
      typeof template_key === 'string' && template_key.trim().length
        ? template_key
        : null
    ;

    this.selected_template_key = this.request_state.selected_template_key;

    if (!this.request_state.user_message) {
      const template_item = this.get_selected_template();
      const default_user_message = get_default_user_message(template_item);
      if (default_user_message) {
        this.request_state.user_message = default_user_message;
      }
    }

    this.params = {
      ...(this.params || {}),
      selected_template_key: this.request_state.selected_template_key,
      user_message: this.request_state.user_message,
    };

    this.refresh_request_panel();
  }

  set_request_mode(mode) {
    if (!SUPPORTED_REQUEST_MODES.has(mode)) return;

    this.request_state.mode = mode;
    this.params = {
      ...(this.params || {}),
      mode,
    };

    this.refresh_request_panel();
  }

  set_user_message(user_message) {
    this.request_state.user_message =
      typeof user_message === 'string'
        ? user_message
        : ''
    ;

    this.params = {
      ...(this.params || {}),
      user_message: this.request_state.user_message,
    };
  }

  get_selected_template() {
    const template_key = this.request_state.selected_template_key;
    if (!template_key) return null;

    return this.env?.smart_templates?.get?.(template_key) || null;
  }

  get_resolved_user_message() {
    const explicit_user_message = String(this.request_state.user_message || '').trim();
    if (explicit_user_message.length) {
      return explicit_user_message;
    }

    return get_default_user_message(this.get_selected_template());
  }

  get_primary_action_label() {
    if (this.request_state.mode === 'generate') {
      return 'Generate';
    }

    return 'Copy prompt';
  }

  open_template_suggest() {
    if (this.inputEl) {
      this.last_input_value = this.inputEl.value;
      this.inputEl.value = '';
    }

    this.update_suggestions('context_suggest_templates');
  }

  clear_selected_template() {
    this.set_selected_template_key(null);
  }

  async run_primary_action() {
    if (this.request_state.mode === 'generate') {
      await this.run_generate_action();
      return;
    }

    await this.run_copy_prompt_action();
  }

  async run_copy_prompt_action() {
    const template_item = this.get_selected_template();
    if (!template_item) {
      new Notice('Select a template first.');
      return;
    }

    await template_item.actions.template_copy_with_context({
      ctx: this.smart_context,
      user_message: this.get_resolved_user_message(),
    });
  }

  async run_generate_action() {
    const template_item = this.get_selected_template();
    if (!template_item) {
      new Notice('Select a template first.');
      return;
    }

    this.env?.events?.emit?.('template_generate:requested', {
      collection_key: template_item.collection_key,
      item_key: template_item.key,
      context_key: this.smart_context?.key,
      user_message: this.get_resolved_user_message(),
      preferred_output_target: this.request_state.preferred_output_target,
      mode: this.request_state.mode,
    });

    new Notice('Generate flow is not wired yet. Add Pro generate actions next.');
  }

  handle_primary_action_error(error) {
    console.error('TemplateContextModal: primary action failed', error);
    new Notice('Template action failed. See console for details.');
  }

  refresh_request_panel() {
    this.render_request_panel().catch((error) => {
      this.handle_request_panel_render_error(error);
    });
  }

  handle_request_panel_render_error(error) {
    console.error('TemplateContextModal: request panel render failed', error);
    new Notice('Template panel failed to render. See console for details.');
  }

  async render_request_panel() {
    if (!this.modalEl) return;

    const render_id = ++this.request_panel_render_id;
    const next_request_panel_el = await this.env.smart_components.render_component(
      'template_request_panel',
      this,
    );

    if (render_id !== this.request_panel_render_id) {
      return;
    }

    if (!next_request_panel_el) {
      return;
    }

    if (this.request_panel_el?.isConnected) {
      this.request_panel_el.remove();
    }

    this.request_panel_el = next_request_panel_el;

    this.modalEl.prepend(next_request_panel_el);
  }
}

export default TemplateContextModal;
