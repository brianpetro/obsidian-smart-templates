import { Platform } from 'obsidian';
import {
  dedupe_template_records,
  get_template_display_right,
  sort_template_records,
} from '../../utils/template_display.js';

const MOD_CHAR = Platform.isMacOS ? '⌘' : 'Ctrl';

/**
 * Return all available template items from the environment.
 *
 * @param {object} env
 * @returns {object[]}
 */
function get_template_items(env) {
  const items = Object.values(env?.smart_templates?.items || {});
  return items.filter(Boolean);
}

/**
 * Lower-case the first character of a label so it reads naturally inside
 * an instruction sentence.
 *
 * @param {string} value
 * @returns {string}
 */
export function lower_case_first_character(value = '') {
  const label = String(value || '').trim();
  if (!label) return '';
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/**
 * Resolve the concrete primary-action label for instruction text.
 *
 * Examples:
 * - `Generate` -> `generate`
 * - `Copy prompt` -> `copy prompt`
 *
 * @param {object} modal
 * @returns {string}
 */
export function get_primary_action_instruction_label(modal) {
  const label = typeof modal?.get_primary_action_label === 'function'
    ? modal.get_primary_action_label()
    : ''
  ;
  const normalized_label = lower_case_first_character(label);
  return normalized_label || 'run the selected action';
}

/**
 * Set modal instructions for template selection mode.
 *
 * @param {object} modal
 * @returns {void}
 */
function set_template_suggest_instructions(modal) {
  if (!modal?.setInstructions) return;

  const primary_action_label = get_primary_action_instruction_label(modal);

  modal.setInstructions([
    { command: 'Enter / ->', purpose: 'Select or unselect template' },
    { command: `${MOD_CHAR} + Enter`, purpose: `Select and ${primary_action_label}` },
    { command: '<-', purpose: 'Back to context suggestions' },
  ]);
}

/**
 * Resolve selected template keys from the modal.
 *
 * @param {object} modal
 * @returns {string[]}
 */
function get_selected_template_keys_from_modal(modal) {
  if (typeof modal?.get_selected_template_keys === 'function') {
    return modal.get_selected_template_keys();
  }

  const template_key = typeof modal?.selected_template_key === 'string'
    ? modal.selected_template_key.trim()
    : ''
  ;
  return template_key ? [template_key] : [];
}

/**
 * @param {object} modal
 * @param {string} template_key
 * @returns {boolean}
 */
function is_template_selected(modal, template_key) {
  return get_selected_template_keys_from_modal(modal).includes(template_key);
}

/**
 * Replace the modal selection set.
 *
 * @param {object} modal
 * @param {string[]} selected_template_keys
 * @returns {void}
 */
function set_selected_template_keys(modal, selected_template_keys = []) {
  if (!modal) return;

  if (typeof modal.set_selected_template_keys === 'function') {
    modal.set_selected_template_keys(selected_template_keys);
    return;
  }

  const next_selected_template_keys = Array.isArray(selected_template_keys)
    ? [...new Set(selected_template_keys.filter(Boolean))]
    : []
  ;

  modal.selected_template_key = next_selected_template_keys[0] || null;
  modal.params = {
    ...(modal.params || {}),
    selected_template_keys: next_selected_template_keys,
  };

  modal.render_request_panel?.();
}

/**
 * Add the template when missing.
 *
 * @param {object} modal
 * @param {object} template_item
 * @returns {void}
 */
function ensure_selected_template(modal, template_item) {
  const template_key = template_item?.key || null;
  if (!modal || !template_key) return;
  if (is_template_selected(modal, template_key)) return;

  if (typeof modal.add_selected_template_key === 'function') {
    modal.add_selected_template_key(template_key);
    return;
  }

  const selected_template_keys = get_selected_template_keys_from_modal(modal);
  set_selected_template_keys(modal, [...selected_template_keys, template_key]);
}

/**
 * Toggle a template in the current selection.
 *
 * Re-selecting a template removes it from the curated selection while preserving
 * the stable order of the remaining templates.
 *
 * @param {object} modal
 * @param {object} template_item
 * @returns {void}
 */
function toggle_selected_template(modal, template_item) {
  const template_key = template_item?.key || null;
  if (!modal || !template_key) return;

  if (typeof modal.toggle_selected_template_key === 'function') {
    modal.toggle_selected_template_key(template_key);
    return;
  }

  const selected_template_keys = get_selected_template_keys_from_modal(modal);
  if (selected_template_keys.includes(template_key)) {
    set_selected_template_keys(
      modal,
      selected_template_keys.filter((selected_key) => selected_key !== template_key),
    );
    return;
  }

  set_selected_template_keys(modal, [...selected_template_keys, template_key]);
}

/**
 * Return from template suggestions to the template modal's context suggestions.
 *
 * @param {object} modal
 * @returns {null}
 */
function restore_context_suggestions(modal) {
  modal?.restore_context_suggestions?.();
  return null;
}

/**
 * Toggle the template, then rebuild the suggestions so selected state updates.
 *
 * @param {object} ctx
 * @param {object} modal
 * @param {object} template_item
 * @returns {object[]}
 */
function select_template_and_refresh(ctx, modal, template_item) {
  toggle_selected_template(modal, template_item);
  return context_suggest_templates.call(ctx, { modal });
}

/**
 * Ensure the template is selected and run the modal primary action.
 *
 * A template that is already selected remains selected so MOD+SELECT can be used
 * to run against an already curated multi-template selection.
 *
 * @param {object} ctx
 * @param {object} modal
 * @param {object} template_item
 * @returns {Promise<object[]>}
 */
async function select_template_and_run(ctx, modal, template_item) {
  ensure_selected_template(modal, template_item);

  if (typeof modal?.run_primary_action === 'function') {
    await modal.run_primary_action();
    modal.close();
  }

  return context_suggest_templates.call(ctx, { modal });
}

/**
 * Build display_right text with an optional selected marker.
 *
 * @param {object} modal
 * @param {object} template_item
 * @returns {string}
 */
function build_display_right(modal, template_item) {
  const base_display_right = get_template_display_right(modal, template_item);
  if (!is_template_selected(modal, template_item?.key)) {
    return base_display_right;
  }

  const parts = [base_display_right, 'selected'].filter(Boolean);
  return parts.join(' | ');
}

/**
 * Suggest available templates inside a SmartContext-bound fuzzy modal.
 *
 * @this {import('smart-contexts').SmartContext}
 * @param {object} [params={}]
 * @param {object} [params.modal]
 * @returns {Array<object>}
 */
export function context_suggest_templates(params = {}) {
  const ctx = this;
  const modal = params?.modal;

  set_template_suggest_instructions(modal);

  const template_records = sort_template_records(
    dedupe_template_records(get_template_items(ctx?.env)),
  );

  if (!template_records.length) {
    return [
      {
        key: 'templates:none',
        display: 'No templates found',
        arrow_left_action: ({ modal } = {}) => {
          return restore_context_suggestions(modal);
        },
      },
    ];
  }

  return template_records.map(({ label, template_item }) => ({
    key: template_item.key,
    display: label,
    display_right: build_display_right(modal, template_item),
    item: template_item,
    select_action: () => {
      return select_template_and_refresh(ctx, modal, template_item);
    },
    mod_select_action: async () => {
      return await select_template_and_run(ctx, modal, template_item);
    },
    arrow_right_action: () => {
      return select_template_and_refresh(ctx, modal, template_item);
    },
    arrow_left_action: ({ modal } = {}) => {
      return restore_context_suggestions(modal);
    },
  }));
}

export const display_name = 'Select templates';

export default {
  context_suggest_templates,
  display_name,
};
