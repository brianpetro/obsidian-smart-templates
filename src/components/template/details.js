import styles from './details.css';
import { escape_html } from 'smart-utils/escape_html.js';
import { run_action_entry } from 'smart-environment/utils/action_entry.js';
import { get_template_name, get_template_origin, get_template_support } from '../../utils/template_display.js';
import { attach_template_disposer } from '../../utils/template_component.js';
import { get_template_event_paths } from '../../utils/template_base.js';

/** Inspect raw Markdown. Declaration parsing and variable merge remain P6 work. */
export function build_html(item, params = {}) {
  const provenance = item.data.provenance;
  const sources = Array.isArray(provenance?.source_keys) ? provenance.source_keys : [];
  return `<section class="st-template-details" aria-label="Template details">
    <div class="st-template-details__heading">
      <h2>${escape_html(get_template_name(item))}</h2>
${params.inspection_only ? '' : '      <button type="button" data-details-action="close" aria-label="Close template details">Close</button>'}
    </div>
    <h3>Structure</h3>
    <p class="st-template-details__status" role="status">Reading template...</p>
    <pre class="st-template-details__content" tabindex="0" aria-label="Template Markdown"></pre>
    <div class="st-template-details__actions" ${params.inspection_only ? 'hidden' : ''}>
${params.inspection_only ? '' : '      <button type="button" data-details-action="use" class="mod-cta">Use template</button>'}
    </div>
    ${!params.inspection_only && item.data.transient ? '<p class="st-template-details__keep-hint">Keep retains this structure in Smart Templates; it does not create a note.</p>' : ''}
    <p class="st-template-details__feedback" role="status">${escape_html(params.feedback || '')}</p>
    ${item.data.transient === false && item._queue_save && provenance?.origin === 'derived_headings' ? '<p>Saving queued.</p>' : ''}
    <details class="st-template-details__about"><summary>About this template</summary>
      <p class="st-template-details__origin">${escape_html(get_template_origin(item))}</p>
      <dl><dt>Identity</dt><dd>${escape_html(item.key)}</dd>
        ${item.data.source_key ? `<dt>Source</dt><dd>${escape_html(item.data.source_key)}</dd>` : ''}</dl>
      ${provenance?.signature ? `<p>${escape_html(get_template_support(item))}. Recurrence is not a quality or confidence score.</p>
        <p>These counts describe the notes used to find the suggestion, not the current Base.</p>
        <p>${Number.isInteger(provenance.heading_count) ? provenance.heading_count : 'Unknown'} headings</p>
        ${sources.length ? `<ul>${sources.map((key) => `<li><button type="button" data-support-source="${escape_html(key)}">${escape_html(key)}</button></li>`).join('')}</ul>` : '<p>Supporting source keys were not recorded.</p>'}
        <details><summary>Canonical signature</summary><pre>${escape_html(provenance.signature)}</pre></details>` : ''}
      <button type="button" data-details-action="reload">Reload content</button>
    </details>
  </section>`;
}

export async function render(item, params = {}) {
  this.apply_style_sheet(styles);
  const container = this.create_doc_fragment(build_html(item, params)).firstElementChild;
  post_process.call(this, item, container, params);
  return container;
}

export function post_process(item, container, params = {}) {
  let disposed = false;
  let loading_id = 0;
  let busy = false;
  let source_stale = false;
  const stale_message = 'Source changed. Showing the previous read; use Reload content.';
  const status = container.querySelector('.st-template-details__status');
  const content = container.querySelector('.st-template-details__content');
  const actions_el = container.querySelector('.st-template-details__actions');
  for (const placement of params.inspection_only ? [] : item.env.resolve_menu_actions('template:action_menu', item, {})) {
    if (placement.menu_only) continue;
    const button = container.ownerDocument.createElement('button');
    button.type = 'button'; button.textContent = placement.title;
    button.dataset.detailsAction = placement.action_key;
    button.disabled = placement.disabled;
    actions_el.appendChild(button);
  }

  const load = async () => {
    const request_id = ++loading_id;
    source_stale = false;
    status.textContent = 'Reading template...';
    try {
      const value = await item.actions.template_read();
      if (disposed || request_id !== loading_id) return;
      content.textContent = typeof value === 'string' ? value : '';
      status.textContent = source_stale ? stale_message : typeof value === 'string'
        ? (value.length ? '' : 'This template is empty.')
        : 'No template content available.';
    } catch (error) {
      if (disposed || request_id !== loading_id) return;
      content.textContent = '';
      status.textContent = `Unable to read template: ${error.message}`;
    }
  };
  const on_click = async (event) => {
    const button = event.target.closest('button');
    if (disposed || !button || button.disabled) return;
    const action_key = button.dataset.detailsAction;
    const source_key = button.dataset.supportSource;
    if (!action_key && !source_key) return;
    event.preventDefault();
    if (action_key === 'close') { params.on_close?.(); return; }
    if (busy) return;
    busy = true; button.disabled = true;
    try {
      if (source_key) {
        const source = item.env.smart_sources.get(source_key);
        if (!source || source.deleted) throw new Error('Supporting source is unavailable.');
        await run_action_entry(source, 'source_open', { event }, { event_source: 'templates_list.provenance' });
      } else if (action_key === 'reload') await load();
      else if (action_key === 'use') await params.on_use(item);
      else await params.on_action(item, action_key, event);
    } catch (error) {
      if (!disposed) status.textContent = error.message;
    } finally {
      busy = false;
      if (!disposed) button.disabled = false;
    }
  };
  container.addEventListener('click', on_click);
  const unsubscribe = item.env.events.on('sources:modified', (event = {}) => {
    if (disposed || (event.collection_key && event.collection_key !== 'smart_sources')) return;
    const source_path = item.data.source_key?.split('#')[0];
    if (!source_path || !get_template_event_paths(event).includes(source_path)) return;
    source_stale = true;
    status.textContent = stale_message;
  });
  attach_template_disposer(this, container, () => {
    disposed = true; loading_id += 1;
    container.removeEventListener('click', on_click);
    unsubscribe();
  }, params.signal);
  if (!disposed) void load();
  return container;
}

export const version = '1.0.0';
