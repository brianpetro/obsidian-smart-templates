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

export class TemplateContextModal extends ContextModal {
  static plugin_version = '2.0.0';
  static version = 2.0;

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
    this.request_panel_controller = null;
    this.mounted_request_panel_controller = null;
    this.preview_open = false;
    this.preview_status = 'empty';
    this.preview_text = null;
    this.preview_error = '';
    this.preview_request_id = 0;
    this.preview_refresh = null;
    this.preview_unsubscribers = [];
    this.closed = false;
    this.copy_pending = false;
    this.workspace_el = null;
    this.request_pane_el = null;
    this.picker_open = false;
    this.picker_revision = 0;
    this.picker_el = null;
    this.context_summary_refresh = null;
    this.request_feedback = '';
    this.request_shortcut_event = null;
    this.structure_open = false;
    this.user_message_touched = Object.prototype.hasOwnProperty.call(params, 'user_message');

    this.context_default_suggest_action_keys = this.build_context_suggest_action_keys(params);
    this.sync_default_user_message();
  }

  /**
   * Resolve placed context modes in menu order. An explicit per-open allowlist,
   * including an empty one, narrows these modes without relying on key prefixes.
   *
   * @param {object} [params={}]
   * @returns {string[]}
   */
  build_context_suggest_action_keys(params = {}) {
    const placements = this.env.resolve_menu_actions(
      'smart_context:suggest',
      this.smart_context,
      { modal: this, surface: 'template_context' },
    );
    const available_keys = placements
      .filter((placement) => !placement.disabled && !placement.menu_only)
      .map((placement) => placement.action_key)
      .filter((action_key) => action_key !== TEMPLATE_SUGGEST_ACTION_KEY);
    if (Array.isArray(params.default_suggest_action_keys)) {
      return dedupe_action_keys(params.default_suggest_action_keys)
        .filter((action_key) => available_keys.includes(action_key));
    }
    return dedupe_action_keys(available_keys);
  }

  /**
   * Prefer the template modal's resolved context-suggest actions when the caller
   * did not provide an explicit override.
   *
   * @returns {string[]}
   */
  get default_suggest_action_keys() {
    if (Array.isArray(this.params?.default_suggest_action_keys)) {
      return this.build_context_suggest_action_keys(this.params);
    }

    if (Array.isArray(this.context_default_suggest_action_keys)) {
      return dedupe_action_keys(this.context_default_suggest_action_keys);
    }

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
   * Determine whether the caller explicitly requested a specific suggestion scope.
   *
   * @param {object} [params={}]
   * @returns {boolean}
   */
  has_explicit_suggest_action_override(params = {}) {
    return Array.isArray(params?.default_suggest_action_keys);
  }

  /**
   * Open directly into template suggestions when the modal is seeded with context.
   *
   * @param {object} [params={}]
   * @returns {boolean}
   */
  should_open_template_suggest_on_open(params = {}) {
    if (this.has_explicit_suggest_action_override(params) || this.get_selected_template_keys().length) return false;
    return Boolean(this.smart_context?.has_context_items);
  }

  /**
   * Prime the first suggestion list before FuzzySuggestModal renders.
   *
   * This prevents a flicker where context scopes briefly render before the
   * template list when the modal already has seeded context.
   *
   * @param {object} [params={}]
   * @returns {void}
   */
  prime_initial_suggestions(params = {}) {
    this.suggestions = null;
    this.is_template_suggest_mode = this.should_open_template_suggest_on_open(params);
    this.picker_open = !this.get_selected_template_keys().length || this.has_explicit_suggest_action_override(params);

    if (!this.is_template_suggest_mode) {
      return;
    }

    this.params = {
      ...(this.params || {}),
      default_suggest_action_keys: null,
    };

    const template_suggestions = this.smart_context?.actions?.context_suggest_templates?.({
      modal: this,
    });

    if (Array.isArray(template_suggestions)) {
      this.suggestions = template_suggestions;
    }
  }

  /**
   * Open the modal and seed the initial suggestion mode before the fuzzy list renders.
   *
   * @param {object} [params={}]
   * @returns {void}
   */
  open(params = {}) {
    this.closed = false;
    this.preview_unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
    const invalidate = () => this.invalidate_request_preview();
    const unsubscribe_context = this.smart_context.on_event?.('context:updated', () => {
      invalidate();
      this.context_summary_refresh?.();
    });
    if (typeof unsubscribe_context === 'function') this.preview_unsubscribers.push(unsubscribe_context);
    for (const name of ['templates:index_changed', 'sources:modified', 'sources:renamed', 'sources:deleted']) {
      const unsubscribe = this.env.events.on(name, invalidate);
      if (typeof unsubscribe === 'function') this.preview_unsubscribers.push(unsubscribe);
    }
    this.params = { ...this.params, ...params };
    this.sync_request_state_from_params(params);
    this.prime_initial_suggestions(params);
    super.open(this.params);
    this.ensure_picker_layout();
    this.sync_picker();
  }

  /** Render one request workspace. Context review stays with Context's builder. */
  async render(params = this.params) {
    if (this.closed) return;
    this.modalEl.classList.add('st-template-context-modal');
    this.ensure_workspace_layout();
    this.ensure_picker_layout();
    await this.render_request_panel();
    if (!this.closed) this.sync_picker();
  }

  /** Keep the request above its temporary, existing native fuzzy picker. */
  ensure_workspace_layout() {
    if (!this.modalEl) return;
    if (!this.workspace_el) {
      const owner_document = this.modalEl.ownerDocument || document;
      this.workspace_el = owner_document.createElement('div');
      this.workspace_el.className = 'st-template-context-modal__workspace';
      this.request_pane_el = owner_document.createElement('div');
      this.request_pane_el.className = 'st-template-context-modal__request-pane';
      this.workspace_el.appendChild(this.request_pane_el);
      this.modalEl.prepend(this.workspace_el);
    }
    if (this.request_panel_el && this.request_panel_el.parentElement !== this.request_pane_el) {
      this.request_pane_el.replaceChildren(this.request_panel_el);
    }
  }

  /** Move native picker elements, not their implementation, into a bounded area. */
  ensure_picker_layout() {
    if (!this.modalEl?.querySelector || this.closed) return;
    if (!this.picker_el) {
      const doc = this.modalEl.ownerDocument || document;
      this.picker_el = doc.createElement('section');
      this.picker_el.className = 'st-template-picker';
      this.picker_el.setAttribute('aria-label', 'Template and context selection');
      const toolbar = doc.createElement('div');
      toolbar.className = 'st-template-picker__toolbar';
      this.picker_title_el = doc.createElement('strong');
      this.picker_summary_el = doc.createElement('span');
      this.picker_summary_el.className = 'st-template-picker__selection';
      this.picker_summary_el.setAttribute('aria-live', 'polite');
      const done = doc.createElement('button');
      done.type = 'button'; done.textContent = 'Done';
      done.dataset.templatePicker = 'done';
      done.addEventListener('click', () => this.finish_picker());
      // Arrow keys/Enter on toolbar controls must not select a hidden fuzzy row.
      toolbar.addEventListener('keydown', (event) => event.stopPropagation());
      toolbar.appendChild(this.picker_title_el);
      toolbar.appendChild(this.picker_summary_el);
      toolbar.appendChild(done);
      this.picker_el.appendChild(toolbar);
      this.modalEl.appendChild(this.picker_el);
    }
    const input = this.inputEl?.closest?.('.prompt-input-container') || this.inputEl;
    for (const element of [input, this.modalEl.querySelector('.prompt-results'), this.modalEl.querySelector('.prompt-instructions')]) {
      if (element && element.parentElement !== this.picker_el) this.picker_el.appendChild(element);
    }
  }

  sync_picker() {
    this.ensure_picker_layout();
    if (!this.picker_el || this.closed) return;
    this.picker_el.hidden = !this.picker_open;
    this.picker_title_el.textContent = this.is_template_suggest_mode ? 'Choose templates' : 'Add context';
    const count = this.get_selected_template_keys().length;
    this.picker_summary_el.textContent = this.is_template_suggest_mode
      ? `${count} selected. Selection order is preserved.` : 'Only added items become Context.';
    this.inputEl?.setAttribute?.('aria-label', this.is_template_suggest_mode ? 'Find templates' : 'Find context');
  }

  /** Closing selection never clears Context, instructions, selected keys or query. */
  finish_picker() {
    this.picker_open = false;
    this.picker_revision += 1;
    this.sync_picker();
    this.request_panel_el?.querySelector('.st-template-request-panel__textarea')?.focus();
  }

  get_suggestions() {
    if (!this.picker_open) return [];
    // A prepared empty list is final, not a reason to rerun the active mode.
    if (Array.isArray(this.suggestions)) return this.filter_suggestions(this.suggestions);
    return super.get_suggestions();
  }

  selectActiveSuggestion(event) {
    const request_target = this.request_panel_el?.contains?.(event?.target);
    const picker_target = !event?.target || !this.picker_el || this.picker_el.contains(event.target);
    if (this.closed || !this.picker_open || !picker_target || event?.target?.closest?.('[data-template-picker]')) {
      // Native Scope callbacks may run before DOM bubbling and set these flags
      // even in the composer. Never carry them into the next picker selection.
      const copy_shortcut = !this.closed && request_target && this.use_mod_select;
      this.use_mod_select = false;
      this.use_shift_select = false;
      this.use_arrow_left = false;
      this.use_arrow_right = false;
      if (copy_shortcut && this.request_shortcut_event !== event) {
        this.request_shortcut_event = event;
        event.preventDefault();
        this.request_feedback = '';
        const feedback = this.request_panel_el.querySelector('.st-template-request-panel__feedback');
        if (feedback) feedback.textContent = '';
        void this.run_primary_action().catch((error) => this.handle_primary_action_error(error));
      }
      return;
    }
    return super.selectActiveSuggestion(event);
  }

  onChooseSuggestion(...args) {
    if (this.closed || !this.picker_open) return;
    return super.onChooseSuggestion(...args);
  }

  /** Guard async picker publication locally; no shared fuzzy-modal changes. */
  async update_suggestions(suggest_ref) {
    const revision = ++this.picker_revision;
    const action = typeof suggest_ref === 'string' ? this.smart_context.actions[suggest_ref] : suggest_ref;
    this._set_custom_instructions = false;
    try {
      const result = typeof action === 'function' ? await action({ modal: this }) : action;
      if (this.closed || !this.picker_open || revision !== this.picker_revision) return;
      if (!Array.isArray(result)) throw new Error('The picker returned no suggestion list.');
      this.suggestions = result;
      this.updateSuggestions();
      if (!this._set_custom_instructions) this.set_default_instructions();
      this.sync_picker();
    } catch (error) {
      if (!this.closed && this.picker_open && revision === this.picker_revision) this.handle_primary_action_error(error);
    }
  }

  /** Avoid the parent's delayed redraw after Done/close; retain row dispatch. */
  async handle_choose_action(suggestion, action_key) {
    const revision = this.picker_revision;
    const index = this.chooser?.values?.findIndex((row) => row.item?.key === suggestion.key) ?? -1;
    try {
      const result = await suggestion[action_key]({ modal: this });
      if (this.closed || !this.picker_open || revision !== this.picker_revision) return;
      if (Array.isArray(result)) this.suggestions = result;
      this.updateSuggestions();
      if (index >= 0) this.chooser?.setSelectedItem(index);
      this.context_summary_refresh?.();
      this.sync_picker();
    } catch (error) {
      if (!this.closed) this.handle_primary_action_error(error);
    }
  }

  onClose() {
    this.closed = true;
    this.picker_open = false;
    this.request_shortcut_event = null;
    this.picker_revision += 1;
    this.picker_el?.remove();
    this.picker_el = null;
    this.context_summary_refresh = null;
    this.preview_request_id += 1;
    this.preview_unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
    this.request_panel_controller?.abort();
    this.mounted_request_panel_controller?.abort();
    this.mounted_request_panel_controller = null;
    this.preview_refresh = null;
    this.preview_text = null;
    this.preview_status = 'empty';
    this.request_panel_render_id += 1;
    this.request_panel_el = null;
    this.request_pane_el?.replaceChildren?.();
    this.workspace_el?.remove?.();
    this.workspace_el = null;
    this.request_pane_el = null;
    this.modalEl?.classList?.remove?.('st-template-context-modal', 'st-template-context-modal--preview');
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
    this.invalidate_request_preview();
    this.request_state.selected_template_keys = normalize_selected_template_keys(template_keys);
    this.selected_template_key = this.request_state.selected_template_keys[0] || null;

    this.sync_default_user_message();
    this.structure_open = false;
    this.sync_picker();
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
   * Remove a selected template key while preserving the order of the remaining selection.
   *
   * @param {string | null} template_key
   * @returns {void}
   */
  remove_selected_template_key(template_key) {
    if (typeof template_key !== 'string' || !template_key.trim().length) return;

    this.set_selected_template_keys(
      this.request_state.selected_template_keys.filter((selected_key) => selected_key !== template_key),
    );
  }

  /**
   * Toggle a selected template key.
   *
   * Re-selecting a template removes it from the current curated set.
   *
   * @param {string | null} template_key
   * @returns {void}
   */
  toggle_selected_template_key(template_key) {
    if (typeof template_key !== 'string' || !template_key.trim().length) return;

    if (this.request_state.selected_template_keys.includes(template_key)) {
      this.remove_selected_template_key(template_key);
      return;
    }

    this.add_selected_template_key(template_key);
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
    this.picker_open = true;
    this.is_template_suggest_mode = true;
    if (this.inputEl) {
      this.last_input_value = this.inputEl.value;
      this.inputEl.value = '';
    }
    this.params = {
      ...(this.params || {}),
      default_suggest_action_keys: null,
    };
    this.ensure_picker_layout();
    this.sync_picker();
    void this.update_suggestions('context_suggest_templates');
    this.inputEl?.focus?.();
  }

  /**
   * Restore the modal to its context-suggestion state.
   *
   * @returns {void}
   */
  restore_context_suggestions() {
    this.picker_open = true;
    this.picker_revision += 1;
    this.is_template_suggest_mode = false;
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
    this.ensure_picker_layout();
    this.sync_picker();

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
    this.invalidate_request_preview();
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
   * Return the instructions already displayed in the textarea. Defaults are
   * seeded by sync_default_user_message(), not restored after an explicit clear.
   *
   * @returns {string}
   */
  get_resolved_user_message() {
    return this.request_state.user_message.trim();
  }

  /**
   * Evidence membership must not hide the same source as a structure template.
   * Context suggestion modes retain the inherited already-added filtering.
   *
   * @param {object[]} suggestions
   * @returns {object[]}
   */
  filter_suggestions(suggestions) {
    return this.is_template_suggest_mode
      ? suggestions
      : super.filter_suggestions(suggestions);
  }

  /**
   * Resolve the primary action kind for the current modal implementation.
   *
   * @returns {'copy'}
   */
  get_primary_action_kind() {
    return 'copy';
  }

  /**
   * Resolve the primary CTA label for the current modal implementation.
   *
   * @returns {string}
   */
  get_primary_action_label() {
    return this.get_primary_action_kind() === 'copy' ? 'Copy prompt' : 'Copy prompt';
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
    if (this.closed || this.copy_pending) return;
    const params = this.get_request_action_params();
    const template_item = this.get_selected_template();
    if (!template_item) {
      this.env?.events?.emit?.('templates:selection_required', {
        level: 'warning',
        message: 'Select one or more templates first.',
        event_source: 'template_context_modal.run_copy_prompt_action',
      });
      return;
    }
    this.copy_pending = true;
    try {
      return await template_item.actions.template_copy_with_context(params);
    } finally { this.copy_pending = false; }
  }

  /** A captured semantic request, shared by preview and copy but never cached output. */
  get_request_action_params() {
    return {
      ctx: this.smart_context,
      user_message: this.get_resolved_user_message(),
      selected_template_keys: this.get_selected_template_keys(),
    };
  }

  invalidate_request_preview() {
    this.preview_request_id += 1;
    this.preview_status = this.preview_text === null ? 'empty' : 'stale';
    this.preview_refresh?.();
  }

  async build_request_preview() {
    if (this.closed) return;
    const request_id = ++this.preview_request_id;
    const params = this.get_request_action_params();
    this.preview_open = true;
    this.preview_status = 'loading';
    this.preview_error = '';
    this.preview_refresh?.();
    try {
      const item = this.get_selected_template();
      if (!item) throw new Error('Select at least one template.');
      const text = await item.actions.template_build_prompt(params);
      if (this.closed || request_id !== this.preview_request_id) return;
      if (typeof text !== 'string') throw new Error('The template builder returned no request text.');
      this.preview_text = text;
      this.preview_status = 'ready';
    } catch (error) {
      if (this.closed || request_id !== this.preview_request_id) return;
      this.preview_text = null;
      this.preview_error = error.message;
      this.preview_status = 'error';
    }
    this.preview_refresh?.();
  }

  /**
   * Handle request-panel action errors with a user-visible notice.
   *
   * @param {unknown} error
   * @returns {void}
   */
  handle_primary_action_error(error) {
    if (this.closed) return;
    this.request_feedback = error?.message || String(error);
    const feedback = this.request_panel_el?.querySelector('.st-template-request-panel__feedback');
    if (feedback) feedback.textContent = this.request_feedback;
    console.error('TemplateContextModal: primary action failed', error);
    this.env?.events?.emit?.('templates:primary_action_failed', {
      level: 'error',
      message: 'Template action failed. See console for details.',
      details: error?.message || '',
      event_source: 'template_context_modal.handle_primary_action_error',
    });
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
    this.env?.events?.emit?.('templates:request_panel_render_failed', {
      level: 'error',
      message: 'Template panel failed to render. See console for details.',
      details: error?.message || '',
      event_source: 'template_context_modal.handle_request_panel_render_error',
    });
  }

  /**
   * Render the request panel into the workspace request pane.
   *
   * @returns {Promise<void>}
   */
  async render_request_panel() {
    if (!this.modalEl || this.closed) return;

    this.ensure_workspace_layout();
    // Cancel superseded pending renders, but keep the mounted panel interactive
    // until its replacement is ready. Otherwise typing during the await is lost.
    if (this.request_panel_controller !== this.mounted_request_panel_controller) {
      this.request_panel_controller?.abort();
    }
    const controller = new AbortController();
    this.request_panel_controller = controller;

    const render_id = ++this.request_panel_render_id;
    const component_key = 'template_request_panel';

    let next_request_panel_el;
    try {
      next_request_panel_el = await this.env.smart_components.render_component(
        component_key,
        this,
        { signal: controller.signal },
      );
    } catch (error) {
      controller.abort();
      throw error;
    }

    if (controller.signal.aborted || render_id !== this.request_panel_render_id || !next_request_panel_el) {
      controller.abort();
      return;
    }

    // Component rendering can yield while the user is still typing in the old
    // panel. Mount current state, not the earlier HTML snapshot, and retain focus.
    const previous_input = this.request_panel_el?.querySelector('.st-template-request-panel__textarea');
    const next_input = next_request_panel_el.querySelector('.st-template-request-panel__textarea');
    const retain_focus = previous_input && this.modalEl.ownerDocument?.activeElement === previous_input;
    if (next_input) next_input.value = this.request_state.user_message;
    this.mounted_request_panel_controller?.abort();
    this.mounted_request_panel_controller = controller;
    this.request_panel_el = next_request_panel_el;
    this.ensure_workspace_layout();
    this.request_pane_el?.replaceChildren?.(next_request_panel_el);
    this.context_summary_refresh?.();
    if (retain_focus && next_input) {
      next_input.focus();
      next_input.setSelectionRange(previous_input.selectionStart, previous_input.selectionEnd);
    }
  }
}

export default TemplateContextModal;
