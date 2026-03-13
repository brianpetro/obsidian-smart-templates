import styles from './request_panel.css';

const REQUEST_PANEL_CLASS = 'st-template-request-panel';

/**
 * @param {import('../../modals/template_context_modal.js').TemplateContextModal} modal
 * @returns {string}
 */
export function build_html(modal) {
  const selected_template = modal.get_selected_template?.() || null;
  const has_template = Boolean(selected_template);
  const selected_template_label = has_template
    ? selected_template.key
    : 'No template selected'
  ;
  const selected_template_meta = has_template
    ? (selected_template?.data?.built_in ? 'Built-in template' : 'Vault template')
    : 'Choose a built-in or vault template'
  ;
  const user_message = typeof modal.request_state?.user_message === 'string'
    ? modal.request_state.user_message
    : ''
  ;
  const primary_label = modal.get_primary_action_label?.() || 'Copy prompt';

  return `<div class="${REQUEST_PANEL_CLASS}">
    <div class="st-template-request-panel__header">
      <div class="st-template-request-panel__header-actions">
        <button
          type="button"
          class="st-template-request-panel__action-btn"
          data-template-action="open-context"
        >Add context</button>
      </div>
    </div>

    <div class="st-template-request-panel__row">
      <div class="st-template-request-panel__label">Template</div>
      <div class="st-template-request-panel__template">
        <div class="st-template-request-panel__template-copy">
          <span class="st-template-request-panel__template-name">${escape_html(selected_template_label)}</span>
          <span class="st-template-request-panel__template-meta">${escape_html(selected_template_meta)}</span>
        </div>
        <div class="st-template-request-panel__template-actions">
          <button
            type="button"
            class="st-template-request-panel__action-btn"
            data-template-action="select-template"
          >${has_template ? 'Change' : 'Select'}</button>
          <button
            type="button"
            class="st-template-request-panel__action-btn"
            data-template-action="clear-template"
            ${has_template ? '' : 'disabled'}
          >Clear</button>
        </div>
      </div>
    </div>

    <div class="st-template-request-panel__row st-template-request-panel__row--fill">
      <div class="st-template-request-panel__label">Instructions</div>
      <textarea
        class="st-template-request-panel__textarea"
        rows="10"
        placeholder="Optional instructions"
      >${escape_html(user_message)}</textarea>
    </div>

    <div class="st-template-request-panel__actions">
      <button
        type="button"
        class="st-template-request-panel__action-btn mod-cta is-active"
        data-template-action="run-primary"
        ${has_template ? '' : 'disabled'}
      >${escape_html(primary_label)}</button>
    </div>
  </div>`;
}

/**
 * @param {import('../../modals/template_context_modal.js').TemplateContextModal} modal
 * @returns {Promise<HTMLElement>}
 */
export async function render(modal) {
  this.apply_style_sheet(styles);
  const frag = this.create_doc_fragment(build_html(modal));
  const container = frag.firstElementChild;
  post_process.call(this, modal, container);
  return container;
}

/**
 * @param {import('../../modals/template_context_modal.js').TemplateContextModal} modal
 * @param {HTMLElement} container
 * @returns {HTMLElement}
 */
export function post_process(modal, container) {
  const textarea = container.querySelector('.st-template-request-panel__textarea');

  container.addEventListener('click', async (event) => {
    const action_el = event.target.closest('[data-template-action]');
    if (!action_el) return;

    event.preventDefault();
    event.stopPropagation();

    const action = action_el.getAttribute('data-template-action');
    if (action === 'open-context') {
      modal.open_context_suggest?.();
      return;
    }
    if (action === 'select-template') {
      modal.open_template_suggest?.();
      return;
    }
    if (action === 'clear-template') {
      modal.clear_selected_template?.();
      return;
    }
    if (action === 'run-primary') {
      try {
        await modal.run_primary_action?.();
      } catch (error) {
        modal.handle_primary_action_error?.(error);
      }
    }
  });

  textarea?.addEventListener('keydown', async (event) => {
    event.stopPropagation();

    const is_mod_enter = event.key === 'Enter' && (event.metaKey || event.ctrlKey);
    if (!is_mod_enter) return;

    event.preventDefault();

    try {
      await modal.run_primary_action?.();
    } catch (error) {
      modal.handle_primary_action_error?.(error);
    }
  });

  textarea?.addEventListener('input', (event) => {
    modal.set_user_message?.(event.target.value);
  });

  return container;
}

/**
 * Minimal HTML escaping for textarea/template labels.
 *
 * @param {string} value
 * @returns {string}
 */
function escape_html(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
  ;
}

export const version = '2.0.0';
render.version = 2.0;
