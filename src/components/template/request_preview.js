import styles from './request_preview.css';
import { attach_template_disposer } from '../../utils/template_component.js';

/** Informational snapshot inside the existing request modal; never an approval lock. */
export function build_html() {
  return `<section class="st-template-request-preview" aria-label="Request preview" hidden>
    <div class="st-template-request-preview__toolbar"><strong>Request preview</strong>
      <button type="button" data-preview-action="refresh">Refresh preview</button>
      <button type="button" data-preview-action="hide">Hide preview</button>
    </div>
    <p class="st-template-request-preview__status" role="status"></p>
    <pre tabindex="0" aria-label="Assembled request snapshot"></pre>
  </section>`;
}

export async function render(modal, params = {}) {
  this.apply_style_sheet(styles);
  const container = this.create_doc_fragment(build_html()).firstElementChild;
  post_process.call(this, modal, container, params);
  return container;
}

export function post_process(modal, container, params = {}) {
  let disposed = false;
  const content = container.querySelector('pre');
  const status = container.querySelector('.st-template-request-preview__status');
  const refresh = container.querySelector('[data-preview-action="refresh"]');
  const update = () => {
    if (disposed) return;
    container.hidden = !modal.preview_open;
    modal.modalEl?.classList?.toggle?.('st-template-context-modal--preview', Boolean(modal.preview_open));
    content.textContent = modal.preview_text || '';
    const message = {
      empty: 'Build a preview to inspect this request.',
      loading: 'Building request preview...',
      ready: 'Read snapshot. Copy prompt rebuilds the current request independently.',
      stale: 'This preview is outdated. Refresh it to inspect the current request.',
      error: `Preview failed: ${modal.preview_error || 'Unknown error'}`,
    };
    status.textContent = message[modal.preview_status || 'empty'];
    refresh.disabled = modal.preview_status === 'loading';
  };
  const on_click = async (event) => {
    const button = event.target.closest('[data-preview-action]');
    if (disposed || !button || button.disabled) return;
    event.preventDefault(); event.stopPropagation();
    if (button.dataset.previewAction === 'hide') {
      modal.preview_open = false; update();
    } else await modal.build_request_preview();
  };
  modal.preview_refresh = update;
  container.addEventListener('click', on_click);
  attach_template_disposer(this, container, () => {
    disposed = true;
    if (modal.preview_refresh === update) modal.preview_refresh = null;
    container.removeEventListener('click', on_click);
  }, params.signal);
  update();
  return container;
}

export const version = '1.0.0';
