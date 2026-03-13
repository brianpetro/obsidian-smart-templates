import { Notice } from 'obsidian';
import { ContextModal } from 'obsidian-smart-env/src/modals/context_selector.js';
import {
  get_selected_template_items,
  normalize_selected_template_keys,
} from '../utils/selected_templates.js';

const DEFAULT_REQUEST_STATE = Object.freeze({
  selected_template_keys: [],
  user_message: '',
  preferred_output_target: null,
});

const DEFAULT_CONTEXT_SUGGEST_ACTION_KEYS = Object.freeze([
  'context_suggest_sources',
  'context_suggest_contexts',
  'context_suggest_blocks',
]);

const CONTEXT_SUGGEST_ACTION_PREFIX = 'context_suggest_';
const TEMPLATE_SUGGEST_ACTION_KEY = 'context_suggest_templates';

/**
 * Clone and normalize request state.
 *
 * @param {object} [request_state={}]
 * @returns {{
 *   selected_template_keys: string[],
 *   user_message: string,
 *   preferred_output_target: string | null
 * }}
 */
function create_request_state(request_state = {}) {
  const next_request_state = {
    ...DEFAULT_REQUEST_STATE,
    ...(request_state || {}),
  };

  next_request_state.selected_template_keys = normalize_selected_template_keys(
    next_request_state.selected_template_keys,
    next_request_state.selected_template_key,
  );

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

/**
 * Remove invalid or duplicate action keys while preserving order.
 *
 * @param {string[]} action_keys
 * @returns {string[]}
 */
function dedupe_action_keys(action_keys = []) {
  return Array.from(new Set(
    (Array.isArray(action_keys) ? action_keys : [])
      .filter((action_key) => typeof action_key === 'string' && action_key.trim().length > 0),
  ));
}

/**
 * @param {string} action_key
 * @returns {boolean}
 */
function is_context_suggest_action_key(action_key) {
  if (typeof action_key !== 'string' || !action_key.length) return false;
  if (!action_key.startsWith(CONTEXT_SUGGEST_ACTION_PREFIX)) return false;
  return action_key !== TEMPLATE_SUGGEST_ACTION_KEY;
}

/**
 * @param {object} env
 * @returns {string[]}
 */
function get_available_context_suggest_action_keys(env) {
  const configured_actions = Object.keys(env?.config?.actions || {});
  return configured_actions.filter((action_key) => is_context_suggest_action_key(action_key));
}

export class TemplateContextModal extends ContextModal {
  static plugin_version = '2.0.0';
  static version = 2.1;

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
    this.selected_template_key = this.request_state.selected_template_keys[0] || null;
    this.request_panel_el = null;
    this.request_panel_render_id = 0;
    this.workspace_el = null;
    this.context_pane_el = null;
    this.request_pane_el = null;
    this.user_message_touched = Object.prototype.hasOwnProperty.call(params, 'user_message');

    this.context_default_suggest_action_keys = this.build_context_suggest_action_keys(params);
    this.sync_default_user_message();
  }

  /**
   * Build the default context-suggest action set for this modal.
   *
   * The template modal cannot rely on `context_selector` modal defaults because it
   * has its own modal key. Resolve the available actions directly from the env so
   * core and early/pro both get a usable context-first flow.
   *
   * Order:
   *   1. Explicit per-open overrides
   *   2. `context_selector` modal defaults
   *   3. Preferred built-in order
   *   4. Any remaining registered `context_suggest_*` action
   *
   * @param {object} [params={}]
   * @returns {string[]}
   */
  build_context_suggest_action_keys(params = {}) {
    const available_action_keys = get_available_context_suggest_action_keys(this.env);
    const explicit_action_keys = dedupe_action_keys(params.default_suggest_action_keys)
      .filter((action_key) => available_action_keys.includes(action_key))
    ;
    if (explicit_action_keys.length) return explicit_action_keys;

    const context_selector_defaults = dedupe_action_keys(
      this.env?.config?.modals?.context_selector?.default_suggest_action_keys,
    ).filter((action_key) => available_action_keys.includes(action_key));

    const ordered_action_keys = dedupe_action_keys([
      ...context_selector_defaults,
      ...DEFAULT_CONTEXT_SUGGEST_ACTION_KEYS,
      ...available_action_keys,
    ]);

    return ordered_action_keys.filter((action_key) => available_action_keys.includes(action_key));
  }

  /**
   * Prefer the template modal's resolved context-suggest actions when the caller
   * did not provide an explicit override.
   *
   * @returns {string[]}
   */
  get default_suggest_action_keys() {
    const explicit_action_keys = dedupe_action_keys(this.params?.default_suggest_action_keys);
    if (explicit_action_keys.length) return explicit_action_keys;

    const resolved_action_keys = dedupe_action_keys(this.context_default_suggest_action_keys);
    if (resolved_action_keys.length) return resolved_action_keys;

    return this.build_context_suggest_action_keys(this.params);
  }

  /**
   * Provide context-scope instructions when multiple suggest actions are available.
   *
   * @returns {void}
   */
  set_default_instructions() {
    const default_action_keys = this.default_suggest_action_keys;
    if (Array.isArray(default_action_keys) && default_action_keys.length > 1) {
      this.setInstructions([
        { command: 'Enter / ->', purpose: 'Browse context suggestions' },
        { command: 'Esc', purpose: 'Close' },
      ], false);
      return;
    }

    super.set_default_instructions();
  }

  /**
   * Keep request_state.user_message aligned with the selected template prompt
   * until the user edits the textarea explicitly.
   *
   * Auto-seeding only applies when exactly one template is selected.
   *
   * @returns {void}
   */
  sync_default_user_message() {
    if (this.user_message_touched) return;

    const selected_templates = this.get_selected_templates();
    if (selected_templates.length !== 1) {
      this.request_state.user_message = '';
      this.params = {
        ...(this.params || {}),
        user_message: this.request_state.user_message,
      };
      return;
    }

    this.request_state.user_message = get_default_user_message(selected_templates[0]);
    this.params = {
      ...(this.params || {}),
      user_message: this.request_state.user_message,
    };
  }

  /**
   * Update request state from params.
   *
   * @param {object} [params={}]
   * @returns {void}
   */
  sync_request_state_from_params(params = {}) {
    this.request_state = create_request_state({
      ...this.request_state,
      ...(params || {}),
    });

    if (Object.prototype.hasOwnProperty.call(params, 'user_message')) {
      this.user_message_touched = true;
    }

    this.context_default_suggest_action_keys = this.build_context_suggest_action_keys({
      ...(this.params || {}),
      ...(params || {}),
    });
    this.selected_template_key = this.request_state.selected_template_keys[0] || null;
    this.sync_default_user_message();
  }

  /**
   * Render the modal shell, then arrange the context view and request panel side by side.
   *
   * @param {object} [params]
   * @returns {Promise<void>}
   */
  async render(params = this.params) {
    this.sync_request_state_from_params(params);
    await super.render(params);

    this.modalEl?.classList?.add('st-template-context-modal');
    if (this.modalEl?.style) {
      this.modalEl.style.height = 'auto';
      this.modalEl.style.maxHeight = '94vh';
    }

    this.ensure_workspace_layout();
    await this.render_request_panel();
  }

  /**
   * Ensure the side-by-side workspace wrapper exists and owns the context view.
   *
   * @returns {void}
   */
  ensure_workspace_layout() {
    if (!this.modalEl) return;

    if (!this.workspace_el) {
      const owner_document = this.modalEl.ownerDocument || document;
      this.workspace_el = owner_document.createElement('div');
      this.workspace_el.className = 'st-template-context-modal__workspace';

      this.context_pane_el = owner_document.createElement('div');
      this.context_pane_el.className = 'st-template-context-modal__context-pane';

      this.request_pane_el = owner_document.createElement('div');
      this.request_pane_el.className = 'st-template-context-modal__request-pane';

      this.workspace_el.appendChild(this.context_pane_el);
      this.workspace_el.appendChild(this.request_pane_el);
      this.modalEl.prepend(this.workspace_el);
    }

    const context_view_el = this.modalEl.querySelector('.sc-context-view');
    if (context_view_el && context_view_el.parentElement !== this.context_pane_el) {
      this.context_pane_el.replaceChildren(context_view_el);
    }

    if (
      this.request_panel_el &&
      this.request_pane_el &&
      this.request_panel_el.parentElement !== this.request_pane_el
    ) {
      this.request_pane_el.replaceChildren(this.request_panel_el);
    }
  }

  onClose() {
    this.request_panel_render_id += 1;
    this.request_panel_el = null;
    this.request_pane_el?.replaceChildren?.();
    this.workspace_el?.remove?.();
    this.workspace_el = null;
    this.context_pane_el = null;
    this.request_pane_el = null;
    this.modalEl?.classList?.remove?.('st-template-context-modal');
    super.onClose();
  }

  /**
   * Return currently selected template keys.
   *
   * @returns {string[]}
   */
  get_selected_template_keys() {
    return [...(this.request_state.selected_template_keys || [])];
  }

  /**
   * Resolve selected SmartTemplate items.
   *
   * @returns {Array<import('../items/smart_template.js').SmartTemplate>}
   */
  get_selected_templates() {
    return get_selected_template_items(
      this.env,
      {
        selected_template_keys: this.request_state.selected_template_keys,
      },
      null,
    );
  }

  /**
   * Resolve the first selected SmartTemplate item.
   *
   * Compatibility helper for older single-template call sites.
   *
   * @returns {import('../items/smart_template.js').SmartTemplate | null}
   */
  get_selected_template() {
    return this.get_selected_templates()[0] || null;
  }

  /**
   * Replace the selected template keys.
   *
   * @param {string[]} template_keys
   * @returns {void}
   */
  set_selected_template_keys(template_keys = []) {
    this.request_state.selected_template_keys = normalize_selected_template_keys(template_keys);
    this.selected_template_key = this.request_state.selected_template_keys[0] || null;

    this.sync_default_user_message();
    this.params = {
      ...(this.params || {}),
      selected_template_keys: this.request_state.selected_template_keys,
      user_message: this.request_state.user_message,
    };

    this.refresh_request_panel();
  }

  /**
   * Add a selected template key while preserving selection order.
   *
   * @param {string | null} template_key
   * @returns {void}
   */
  add_selected_template_key(template_key) {
    if (typeof template_key !== 'string' || !template_key.trim().length) return;

    this.set_selected_template_keys([
      ...this.request_state.selected_template_keys,
      template_key,
    ]);
  }

  /**
   * Compatibility alias for older single-template selection calls.
   *
   * @param {string | null} template_key
   * @returns {void}
   */
  set_selected_template_key(template_key) {
    this.add_selected_template_key(template_key);
  }

  /**
   * Switch the suggestion list into template selection mode.
   *
   * @returns {void}
   */
  open_template_suggest() {
    if (this.inputEl) {
      this.last_input_value = this.inputEl.value;
      this.inputEl.value = '';
    }
    this.params = {
      ...(this.params || {}),
      default_suggest_action_keys: null,
    };
    this.update_suggestions('context_suggest_templates');
  }

  /**
   * Restore the modal to its context-suggestion state.
   *
   * @returns {void}
   */
  restore_context_suggestions() {
    const default_action_keys = this.default_suggest_action_keys;

    if (this.inputEl) {
      const next_value = typeof this.last_input_value === 'string'
        ? this.last_input_value
        : ''
      ;
      this.inputEl.value = next_value;
      this.inputEl.focus?.();
      const cursor_position = this.inputEl.value.length;
      this.inputEl.setSelectionRange?.(cursor_position, cursor_position);
    }

    this.suggestions = null;
    this.params = {
      ...(this.params || {}),
      default_suggest_action_keys: default_action_keys,
    };
    this.set_default_instructions();

    if (default_action_keys.length === 1) {
      this.update_suggestions(default_action_keys[0]);
      return;
    }

    this.updateSuggestions();
  }

  /**
   * Switch back into context suggestion mode.
   *
   * @returns {void}
   */
  open_context_suggest() {
    this.restore_context_suggestions();
  }

  /**
   * Clear all selected templates from the transient request state.
   *
   * @returns {void}
   */
  clear_selected_template() {
    this.set_selected_template_keys([]);
  }

  /**
   * Update transient instructions for the current request.
   *
   * @param {string} user_message
   * @returns {void}
   */
  set_user_message(user_message) {
    this.user_message_touched = true;
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

  /**
   * Resolve the user message, falling back to template metadata when no explicit value exists.
   *
   * Auto-seeding only applies when exactly one template is selected.
   *
   * @returns {string}
   */
  get_resolved_user_message() {
    const explicit_user_message = String(this.request_state.user_message || '').trim();
    if (explicit_user_message.length) {
      return explicit_user_message;
    }

    const selected_templates = this.get_selected_templates();
    if (selected_templates.length !== 1) return '';
    return get_default_user_message(selected_templates[0]);
  }

  /**
   * Resolve the primary CTA label for the current modal implementation.
   *
   * @returns {string}
   */
  get_primary_action_label() {
    return 'Copy prompt';
  }

  /**
   * Resolve the request-panel component key.
   *
   * Pro overrides this so the request panel does not depend on merged-key precedence.
   *
   * @returns {string}
   */
  get_request_panel_component_key() {
    return 'template_request_panel';
  }

  /**
   * Run the primary request action for the current modal implementation.
   *
   * Core always copies the prompt.
   *
   * @returns {Promise<void>}
   */
  async run_primary_action() {
    await this.run_copy_prompt_action();
  }

  /**
   * Copy the built template prompt to the clipboard.
   *
   * @returns {Promise<void>}
   */
  async run_copy_prompt_action() {
    const selected_template_keys = this.get_selected_template_keys();
    const template_item = this.get_selected_template();
    if (!template_item) {
      new Notice('Select one or more templates first.');
      return;
    }

    await template_item.actions.template_copy_with_context({
      ctx: this.smart_context,
      user_message: this.get_resolved_user_message(),
      selected_template_keys,
    });
  }

  /**
   * Handle request-panel action errors with a user-visible notice.
   *
   * @param {unknown} error
   * @returns {void}
   */
  handle_primary_action_error(error) {
    console.error('TemplateContextModal: primary action failed', error);
    new Notice('Template action failed. See console for details.');
  }

  /**
   * Refresh the panel without rerendering the full fuzzy modal.
   *
   * @returns {void}
   */
  refresh_request_panel() {
    this.render_request_panel().catch((error) => {
      this.handle_request_panel_render_error(error);
    });
  }

  /**
   * Handle request-panel render errors with a user-visible notice.
   *
   * @param {unknown} error
   * @returns {void}
   */
  handle_request_panel_render_error(error) {
    console.error('TemplateContextModal: request panel render failed', error);
    new Notice('Template panel failed to render. See console for details.');
  }

  /**
   * Render the request panel into the workspace request pane.
   *
   * @returns {Promise<void>}
   */
  async render_request_panel() {
    if (!this.modalEl) return;

    this.ensure_workspace_layout();

    const render_id = ++this.request_panel_render_id;
    const component_key = this.get_request_panel_component_key();

    let next_request_panel_el = null;
    try {
      next_request_panel_el = await this.env.smart_components.render_component(
        component_key,
        this,
      );
    } catch (error) {
      if (component_key !== 'template_request_panel') {
        next_request_panel_el = await this.env.smart_components.render_component(
          'template_request_panel',
          this,
        );
      } else {
        throw error;
      }
    }

    if (render_id !== this.request_panel_render_id || !next_request_panel_el) {
      return;
    }

    this.request_panel_el = next_request_panel_el;
    this.ensure_workspace_layout();
    this.request_pane_el?.replaceChildren?.(next_request_panel_el);
  }
}

export default TemplateContextModal;
