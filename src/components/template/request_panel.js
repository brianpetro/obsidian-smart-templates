import styles from './request_panel.css';
import { escape_html } from 'smart-utils/escape_html.js';
import { attach_template_disposer } from '../../utils/template_component.js';
import {
  format_selected_templates_label,
  format_selected_templates_meta,
} from '../../utils/selected_templates.js';

const REQUEST_PANEL_CLASS = 'st-template-request-panel';

/** Display selected inputs only. Do not hydrate rules, read sources or invent provenance. */
export function get_context_summary(ctx) {
  return Object.entries(ctx?.data?.context_items || {})
    .filter(([, data]) => !data.exclude)
    .sort(([, left], [, right]) => (left.at || 0) - (right.at || 0))
    .map(([key, data]) => {
      const text = data.kind === 'text' || key.startsWith('selection:') || key.startsWith('inline:');
      const label = text ? 'Selected text' : data.named_context ? `Named context: ${data.name || key}`
        : data.folder ? `Folder: ${data.source_path || key}` : data.title || data.name || key;
      return { label, excerpt: text && typeof data.content === 'string'
        ? data.content.replace(/\s+/g, ' ').slice(0, 160) : '' };
    });
}

function context_html(ctx) {
  const items = get_context_summary(ctx);
  if (!items.length) return '<p>No context selected. Add context to ground this request.</p>';
  return `<ul>${items.slice(0, 4).map(({ label, excerpt }) => `<li>${escape_html(label)}${excerpt ? `<span>${escape_html(excerpt)}</span>` : ''}</li>`).join('')}</ul>`
    + (items.length > 4 ? `<p>${items.length - 4} more selected inputs. Review context to inspect them.</p>` : '')
    + '<small>Selected inputs. Review context to inspect expanded content and exclusions.</small>';
}

/** The request's inputs stay visible; catalog maintenance belongs in the library. */
export function build_html(modal) {
  const selected_templates = modal.get_selected_templates?.() || [];
  const has_templates = selected_templates.length > 0;
  const selected_template_label = format_selected_templates_label(selected_templates);
  const selected_template_meta = format_selected_templates_meta(selected_templates);
  const user_message = typeof modal.request_state?.user_message === 'string' ? modal.request_state.user_message : '';
  const primary_label = modal.get_primary_action_label?.() || 'Copy prompt';
  return `<div class="${REQUEST_PANEL_CLASS}">
    <h2 class="st-template-request-panel__title">Template request</h2>
    <section class="st-template-request-panel__context" aria-label="Request context">
      <div class="st-template-request-panel__section-heading"><strong>Context</strong>
        <div class="st-template-request-panel__template-actions">
          <button type="button" data-template-action="review-context">Review context</button>
          <button type="button" data-template-action="open-context">Add context</button>
        </div>
      </div>
      <div class="st-template-request-panel__context-summary">${context_html(modal.smart_context)}</div>
    </section>
    <section class="st-template-request-panel__template" aria-label="Selected structure">
      <div class="st-template-request-panel__section-heading"><strong>Template${selected_templates.length > 1 ? 's (selection order)' : ''}</strong>
        <div class="st-template-request-panel__template-actions">
          <button type="button" data-template-action="select-template">${has_templates ? 'Change' : 'Select'}</button>
          ${has_templates ? '<button type="button" data-template-action="clear-template">Clear</button>' : ''}
        </div>
      </div>
      <span class="st-template-request-panel__template-name">${escape_html(selected_template_label)}</span>
      <span class="st-template-request-panel__template-meta">${escape_html(selected_template_meta)}</span>
      ${has_templates ? `<details class="st-template-request-panel__structure" ${modal.structure_open ? 'open' : ''}>
        <summary>Inspect structure</summary><div class="st-template-request-panel__structure-content"></div>
      </details>` : ''}
    </section>
    <label class="st-template-request-panel__row"><strong>Instructions</strong>
      <textarea class="st-template-request-panel__textarea" rows="4" placeholder="Optional instructions">${escape_html(user_message)}</textarea>
    </label>
    <p class="st-template-request-panel__feedback" role="alert">${escape_html(modal.request_feedback || '')}</p>
    <div class="st-template-request-panel__actions">
      <button type="button" data-template-action="preview-request" ${has_templates ? '' : 'disabled'}>Preview request</button>
      <button type="button" class="st-template-request-panel__action-btn mod-cta" data-template-action="run-primary" ${has_templates ? '' : 'disabled'}>${escape_html(primary_label)}</button>
    </div>
    <p class="st-template-request-panel__availability" role="status" hidden></p>
  </div>`;
}

export async function render(modal, params = {}) {
  this.apply_style_sheet(styles);
  const container = this.create_doc_fragment(build_html(modal)).firstElementChild;
  post_process.call(this, modal, container, params);
  if (params.signal?.aborted) return container;
  const preview = await modal.env.smart_components.render_component('template_request_preview', modal, params);
  if (preview) container.appendChild(preview);
  return container;
}

/** Controls invoke the same modal/Context/action owners; no new request lifetime. */
export function post_process(modal, container, params = {}) {
  let disposed = false;
  let structure_controller = null;
  const textarea = container.querySelector('.st-template-request-panel__textarea');
  const summary = container.querySelector('.st-template-request-panel__context-summary');
  const structure = container.querySelector('.st-template-request-panel__structure');
  const availability = container.querySelector('.st-template-request-panel__availability');
  const refresh_context = () => {
    if (disposed || !summary) return;
    // All authored values are escaped by context_html; no Markdown/HTML execution.
    const fragment = this.create_doc_fragment(context_html(modal.smart_context));
    summary.replaceChildren(fragment);
  };
  const refresh_availability = () => {
    if (disposed || !availability) return;
    const templates = modal.env.smart_templates;
    const keys = modal.get_selected_template_keys?.() || [];
    const visible = new Set(templates?.get_visible_templates?.(modal.params).map((item) => item.key) || []);
    const missing = keys.filter((key) => !visible.has(key));
    const state = templates?.get_discovery_state(modal.params);
    availability.textContent = missing.length ? 'A selected template is no longer available for this note. Review your selection.'
      : state?.adapter_key === 'bases' && ['last_good', 'unavailable', 'stale'].includes(state.status)
        ? 'Template choices may be outdated or unavailable. Check Base results in the Templates library.' : '';
    availability.hidden = !availability.textContent;
  };
  const inspect = async () => {
    if (disposed) return;
    modal.structure_open = structure.open;
    structure_controller?.abort();
    const target = structure.querySelector('.st-template-request-panel__structure-content');
    target.replaceChildren();
    if (!structure.open || disposed) return;
    const controller = new AbortController(); structure_controller = controller;
    try {
      for (const item of modal.get_selected_templates()) {
        const details = await modal.env.smart_components.render_component('template_details', item, {
          signal: controller.signal, inspection_only: true,
        });
        if (disposed || controller.signal.aborted) return;
        if (details) target.appendChild(details);
      }
    } catch (error) {
      if (!disposed && !controller.signal.aborted) target.textContent = `Unable to inspect structure: ${error.message}`;
    }
  };
  structure?.addEventListener('toggle', inspect);
  const clear_feedback = () => {
    modal.request_feedback = '';
    const feedback = container.querySelector('.st-template-request-panel__feedback');
    if (feedback) feedback.textContent = '';
  };
  const on_click = async (event) => {
    const button = event.target.closest('[data-template-action]');
    if (!button || button.disabled || modal.closed || disposed) return;
    event.preventDefault(); event.stopPropagation();
    const action = button.getAttribute('data-template-action');
    if (action === 'run-primary' || action === 'preview-request') clear_feedback();
    try {
      if (action === 'review-context') {
        modal.finish_picker?.();
        modal.smart_context.emit_event('context_selector:open');
      } else if (action === 'open-context') modal.open_context_suggest?.();
      else if (action === 'select-template') modal.open_template_suggest?.();
      else if (action === 'clear-template') modal.clear_selected_template?.();
      else if (action === 'preview-request') await modal.build_request_preview();
      else if (action === 'run-primary') {
        button.disabled = true;
        await modal.run_primary_action?.();
      }
    } catch (error) { if (!disposed) modal.handle_primary_action_error(error); }
    finally { if (!disposed) button.disabled = false; }
  };
  const on_keydown = async (event) => {
    // Request fields/buttons are not fuzzy-picker operands.
    event.stopPropagation();
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    if (modal.request_shortcut_event === event) return;
    modal.request_shortcut_event = event;
    clear_feedback();
    try { await modal.run_primary_action?.(); }
    catch (error) { if (!disposed) modal.handle_primary_action_error(error); }
  };
  const on_input = (event) => modal.set_user_message(event.target.value);
  container.addEventListener('click', on_click);
  container.addEventListener('keydown', on_keydown);
  textarea?.addEventListener('input', on_input);
  modal.context_summary_refresh = refresh_context;
  const unsubscribe = modal.env.events?.on('templates:index_changed', refresh_availability);
  refresh_availability();
  if (this?.attach_disposer) attach_template_disposer(this, container, () => {
    disposed = true; structure_controller?.abort(); unsubscribe?.();
    if (modal.context_summary_refresh === refresh_context) modal.context_summary_refresh = null;
    structure?.removeEventListener('toggle', inspect);
    container.removeEventListener('click', on_click);
    container.removeEventListener('keydown', on_keydown);
    textarea?.removeEventListener('input', on_input);
  }, params.signal);
  return container;
}

export const version = '2.0.0';
render.version = 2.0;
