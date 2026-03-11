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
 * Set modal instructions for template selection mode.
 *
 * @param {object} modal
 * @returns {void}
 */
function set_template_suggest_instructions(modal) {
  if (!modal?.setInstructions) return;

  modal.setInstructions([
    { command: 'Enter / →', purpose: 'Select template' },
    { command: `${MOD_CHAR} + Enter`, purpose: 'Select and run current mode' },
    { command: '←', purpose: 'Back to context suggestions' },
  ]);
}

/**
 * Apply the selected template to the modal.
 *
 * @param {object} modal
 * @param {object} template_item
 * @returns {void}
 */
function apply_selected_template(modal, template_item) {
  const template_key = template_item?.key || null;
  if (!modal || !template_key) return;

  if (typeof modal.set_selected_template_key === 'function') {
    modal.set_selected_template_key(template_key);
    return;
  }

  modal.selected_template_key = template_key;
  modal.params = {
    ...(modal.params || {}),
    selected_template_key: template_key,
  };

  if (typeof modal.render_request_panel === 'function') {
    modal.render_request_panel();
  }
}

/**
 * Select the template, then rebuild the suggestions so selected state updates.
 *
 * @param {object} ctx
 * @param {object} modal
 * @param {object} template_item
 * @returns {object[]}
 */
function select_template_and_refresh(ctx, modal, template_item) {
  apply_selected_template(modal, template_item);
  return context_suggest_templates.call(ctx, { modal });
}

/**
 * Select the template and run the modal primary action.
 *
 * @param {object} ctx
 * @param {object} modal
 * @param {object} template_item
 * @returns {Promise<object[]>}
 */
async function select_template_and_run(ctx, modal, template_item) {
  apply_selected_template(modal, template_item);

  if (typeof modal?.run_primary_action === 'function') {
    await modal.run_primary_action();
  }

  return context_suggest_templates.call(ctx, { modal });
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
      },
    ];
  }

  return template_records.map(({ label, template_item }) => ({
    key: template_item.key,
    display: label,
    display_right: get_template_display_right(modal, template_item),
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
  }));
}

export const display_name = 'Select templates';

export default {
  context_suggest_templates,
  display_name,
};
