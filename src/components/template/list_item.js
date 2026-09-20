import { escape_html } from 'smart-utils/escape_html.js';
import { get_template_name, is_suggested_template } from '../../utils/template_display.js';
import { attach_template_disposer } from '../../utils/template_component.js';

/** Row scope is the exact SmartTemplate, never the request action's scope. */
export function build_html(item, params = {}) {
  const name = get_template_name(item);
  const actions = item.env.resolve_menu_actions('template:action_menu', item, {});
  const confirm = !is_suggested_template(item) && actions.find((action) => action.action_key === 'template_confirm' && !action.menu_only);
  const support = item.data.provenance?.support;
  const secondary = item.data.source_key || (is_suggested_template(item) && Number.isInteger(support)
    ? `Found in ${support} notes during the last scan` : item.data.description || '');
  return `<div class="st-template-row${params.focused ? ' is-focused' : ''}" data-template-key="${escape_html(item.key)}">
    <button type="button" class="st-template-row__inspect" aria-pressed="${Boolean(params.focused)}" aria-label="${escape_html(`Inspect ${name}`)}">
      <span class="st-template-row__name">${escape_html(name)}</span>
      ${secondary ? `<span class="st-template-row__meta">${escape_html(secondary)}</span>` : ''}
    </button>
    <button type="button" class="st-template-row__use" ${params.use_disabled ? 'disabled' : ''} aria-label="${escape_html(`Use template: ${name}`)}">Use template</button>
    ${confirm ? `<button type="button" data-row-action="template_confirm" ${confirm.disabled || params.busy ? 'disabled' : ''}>${escape_html(confirm.title)}</button>` : ''}
    <button type="button" class="st-template-row__menu" aria-label="${escape_html(`Actions for ${name}`)}">...</button>
    ${confirm && item._queue_save ? '<span class="st-template-row__persistence">Saving queued.</span>' : ''}
    ${params.feedback ? `<span class="st-template-row__feedback" role="status">${escape_html(params.feedback)}</span>` : ''}
  </div>`;
}

export async function render(item, params = {}) {
  const container = this.create_doc_fragment(build_html(item, params)).firstElementChild;
  post_process.call(this, item, container, params);
  return container;
}

export function post_process(item, container, params = {}) {
  let disposed = false;
  const on_click = (event) => {
    if (disposed) return;
    const target = event.target.closest('button');
    if (!target) return;
    event.preventDefault();
    if (target.disabled) return;
    if (target.classList.contains('st-template-row__inspect')) params.on_focus(item);
    else if (target.classList.contains('st-template-row__use')) params.on_use(item);
    else if (target.classList.contains('st-template-row__menu')) params.on_menu(item, event);
    else params.on_action(item, target.dataset.rowAction, event);
  };
  const on_menu = (event) => { if (!disposed) { event.preventDefault(); params.on_menu(item, event); } };
  container.addEventListener('click', on_click);
  container.addEventListener('contextmenu', on_menu);
  attach_template_disposer(this, container, () => {
    disposed = true;
    container.removeEventListener('click', on_click);
    container.removeEventListener('contextmenu', on_menu);
  }, params.signal);
  return container;
}

export const version = '1.0.0';
