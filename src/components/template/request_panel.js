import { escape_html } from 'smart-utils/escape_html.js';
import styles from './request_panel.css';
import { resolve_template_label } from '../../utils/template_display.js';

const PRIMARY_ACTION_ERROR_MESSAGE = 'Template action failed. See console for details.';
const INSTRUCTIONS_INPUT_ID = 'st-template-request-panel__instructions-input';

/**
 * Build the request panel markup for TemplateContextModal.
 *
 * @param {import('../../modals/template_context_modal.js').TemplateContextModal} modal
 * @param {object} [params={}]
 * @returns {string}
 */
export function build_html(modal, params = {}) {
  const template_item = modal?.get_selected_template?.() || null;
  const template_label = resolve_template_label(template_item) || 'No template selected';
  const request_mode = modal?.request_state?.mode === 'generate'
    ? 'generate'
    : 'copy_prompt'
  ;
  const has_selected_template = Boolean(modal?.request_state?.selected_template_key);
  const primary_action_label = escape_html(
    modal?.get_primary_action_label?.() || 'Copy prompt',
  );

  return `
    <div class="st-template-request-panel">
      <div class="st-template-request-panel__header">
        <div class="st-template-request-panel__summary">
          <div class="st-template-request-panel__label">Template</div>
          <div class="st-template-request-panel__value">${escape_html(template_label)}</div>
        </div>

        <div class="st-template-request-panel__controls">
          <button
            type="button"
            class="st-template-request-panel__select-template"
            data-st-action="select-template"
          >Select template</button>
          ${has_selected_template ? `
            <button
              type="button"
              class="st-template-request-panel__clear-template"
              data-st-action="clear-template"
            >Clear</button>
          ` : ''}
        </div>
      </div>

      <div class="st-template-request-panel__mode">
        <div class="st-template-request-panel__mode-label">Mode</div>
        <div class="st-template-request-panel__mode-buttons">
          <button
            type="button"
            class="st-template-request-panel__mode-btn${request_mode === 'copy_prompt' ? ' is-active' : ''}"
            data-st-action="set-mode"
            data-st-mode="copy_prompt"
            aria-pressed="${request_mode === 'copy_prompt' ? 'true' : 'false'}"
          >Copy prompt</button>
          <button
            type="button"
            class="st-template-request-panel__mode-btn${request_mode === 'generate' ? ' is-active' : ''}"
            data-st-action="set-mode"
            data-st-mode="generate"
            aria-pressed="${request_mode === 'generate' ? 'true' : 'false'}"
          >Generate</button>
        </div>
      </div>

      <div class="st-template-request-panel__instructions">
        <label
          for="${INSTRUCTIONS_INPUT_ID}"
          class="st-template-request-panel__instructions-label"
        >Additional instructions</label>
        <textarea
          id="${INSTRUCTIONS_INPUT_ID}"
          class="st-template-request-panel__instructions-input"
          rows="6"
          placeholder="Optional extra instructions for this run"
        ></textarea>
      </div>

      <div class="st-template-request-panel__actions">
        <div></div>
        <button
          type="button"
          class="st-template-request-panel__run-btn mod-cta"
          data-st-action="run"
          ${has_selected_template ? '' : 'disabled'}
        >${primary_action_label}</button>
      </div>
    </div>
  `.trim();
}

/**
 * Render the template request panel component.
 *
 * @param {import('../../modals/template_context_modal.js').TemplateContextModal} modal
 * @param {object} [params={}]
 * @returns {Promise<HTMLElement>}
 */
export async function render(modal, params = {}) {
  this.apply_style_sheet(styles);
  const html = build_html.call(this, modal, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  await post_process.call(this, modal, container, params);
  return container;
}

/**
 * Attach behavior to the template request panel.
 *
 * @param {import('../../modals/template_context_modal.js').TemplateContextModal} modal
 * @param {HTMLElement} container
 * @param {object} [params={}]
 * @returns {Promise<HTMLElement>}
 */
export async function post_process(modal, container, params = {}) {
  const disposers = [];

  const instructions_input_el = container.querySelector(
    '.st-template-request-panel__instructions-input',
  );
  if (instructions_input_el) {
    instructions_input_el.value = modal?.get_resolved_user_message?.() || '';
    const input_handler = (event) => {
      modal?.set_user_message?.(event?.target?.value || '');
    };
    instructions_input_el.addEventListener('input', input_handler);
    disposers.push(() => {
      instructions_input_el.removeEventListener('input', input_handler);
    });
  }

  const register_click = (selector, handler) => {
    const el = container.querySelector(selector);
    if (!el) return;
    el.addEventListener('click', handler);
    disposers.push(() => {
      el.removeEventListener('click', handler);
    });
  };

  register_click('[data-st-action="select-template"]', () => {
    modal?.open_template_suggest?.();
  });

  register_click('[data-st-action="clear-template"]', () => {
    modal?.clear_selected_template?.();
  });

  const mode_button_els = container.querySelectorAll('[data-st-action="set-mode"]');
  mode_button_els.forEach((mode_button_el) => {
    const click_handler = () => {
      const next_mode = mode_button_el.getAttribute('data-st-mode') || '';
      modal?.set_request_mode?.(next_mode);
    };
    mode_button_el.addEventListener('click', click_handler);
    disposers.push(() => {
      mode_button_el.removeEventListener('click', click_handler);
    });
  });

  register_click('[data-st-action="run"]', () => {
    modal?.run_primary_action?.().catch((error) => {
      if (typeof modal?.handle_primary_action_error === 'function') {
        modal.handle_primary_action_error(error);
        return;
      }
      console.error('Template request panel: primary action failed', error);
      modal?.env?.events?.emit?.('notification:error', {
        message: PRIMARY_ACTION_ERROR_MESSAGE,
      });
    });
  });

  this.attach_disposer(container, disposers);
  return container;
}

export const version = 1;
