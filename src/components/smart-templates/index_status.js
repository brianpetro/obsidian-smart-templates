import styles from './index_status.css';
import { attach_template_disposer } from '../../utils/template_component.js';

/** Counts describe visible templates, not Base rows, files, or raw catalog size. */
export function get_source_counts(templates, params = {}) {
  const counts = { vault: 0, built_in: 0, saved: 0, suggested: 0 };
  for (const item of templates.get_visible_templates(params)) {
    if (item.data.built_in) counts.built_in += 1;
    else if (item.data.source_key) counts.vault += 1;
    else if (item.data.transient === true && item.data.provider_key === 'derived_headings') counts.suggested += 1;
    else counts.saved += 1;
  }
  return counts;
}

function plural(count, singular, multiple = `${singular}s`) {
  return `${count} ${count === 1 ? singular : multiple}`;
}

/** Policy-specific labels keep the stable action and its existing effects intact. */
export function get_refresh_label(state) {
  return state?.adapter_key === 'bases' ? 'Refresh Base results' : 'Find recurring structures';
}

export function get_status_text(templates, params = {}) {
  const state = templates.get_discovery_state(params);
  if (!state) return 'Templates are unavailable.';
  const counts = get_source_counts(templates, params);
  if (params.mode === 'scan') {
    const derived = state.derived;
    if (!derived || !derived.revision) return 'No completed scan yet. Find structures shared by notes in the represented corpus.';
    return `${plural(counts.suggested, 'recurring structure')} available from the last scan. `
      + `${derived.eligible_source_count} eligible sources out of ${derived.inspected_source_count} considered.`;
  }
  const parts = [];
  if (state.revision > 0 || counts.vault > 0) {
    parts.push(plural(counts.vault, 'template') + (state.adapter_key === 'bases' ? ' from this Base' : ' from your notes'));
  }
  if (counts.built_in) parts.push(plural(counts.built_in, 'built-in'));
  if (counts.saved) parts.push(plural(counts.saved, 'kept template'));
  if (counts.suggested && params.mode !== 'discovery') parts.push(plural(counts.suggested, 'recurring structure'));
  return parts.join(' · ') || 'No templates available.';
}

export function get_status_warning(state, params = {}) {
  if (!state) return '';
  const messages = [];
  if (params.mode !== 'scan') {
    if (state.status === 'last_good') messages.push("Couldn't refresh. Showing the last successful list.");
    else if (state.status === 'unavailable') messages.push('Vault templates are unavailable. Check the template source.');
    else if (state.status === 'unprepared') messages.push('Vault templates have not been checked for this note yet.');
    else if (state.status === 'stale') messages.push('The template source may have changed.');
    else if (state.issues.length) messages.push('Some source results could not be used. See source details.');
  }
  if (params.mode !== 'discovery') {
    if (state.derived?.status === 'last_good') messages.push("Couldn't update recurring structures. Showing the last prepared suggestions.");
    else if (state.derived?.status === 'stale') messages.push('Recurring structures may be outdated. Find recurring structures to scan again.');
    else if (state.derived?.status === 'unavailable') messages.push('The recurring-structure scan failed. See scan details.');
    // A successful scan with bounded exclusions is not a request-level failure.
  }
  return messages.join(' ');
}

const expected_exclusions = new Set(['heading_syntax_unsupported', 'heading_depth_unsupported', 'source_type_unsupported']);

/** Group recorded issues only. A source may occur in more than one group. */
export function get_issue_groups(issues = []) {
  const groups = new Map();
  for (const issue of issues) {
    const code = issue.code || 'unspecified';
    if (!groups.has(code)) groups.set(code, { code, expected: expected_exclusions.has(code), sources: new Set(), rows: [], seen: new Set() });
    const group = groups.get(code);
    const identity = issue.source_key || issue.block_key || issue.path || issue.base_key || '';
    if (identity) group.sources.add(issue.source_key || identity);
    const fingerprint = JSON.stringify([identity, issue.message]);
    if (group.seen.has(fingerprint)) continue;
    group.seen.add(fingerprint);
    group.rows.push({ identity: identity || 'Source identity was not recorded', message: issue.message || code });
  }
  return [...groups.values()].map(({ code, expected, sources, rows }) => ({ code, expected, source_count: sources.size, rows }));
}

/** Source-addressable diagnostics; never reconstruct unknown eligibility counts. */
export function get_status_details(state, params = {}) {
  if (!state) return 'Smart Templates is not currently available.';
  const lines = [];
  if (params.mode !== 'scan') {
    lines.push(`Source: ${state.adapter_key === 'bases' ? 'Base' : 'Folder and note rules'}`, `State: ${state.status}`);
    if (state.base_key) lines.push(`Base: ${state.base_key}`, `View: ${state.view_name || 'First declared view'}`);
  }
  if (params.mode !== 'discovery' && state.derived) {
    lines.push(`Scan: ${state.derived.status}`);
    if (state.derived.inspected_source_count !== undefined) {
      lines.push(`Eligible notes: ${state.derived.eligible_source_count} of ${state.derived.inspected_source_count}`);
    }
    lines.push('Coverage describes the last scan, not relevance to the starting note.',
      'Eligibility also depends on retained heading count. Recorded issue groups are not a complete exclusion census.');
  }
  const issues = [
    ...(params.mode === 'scan' ? [] : state.issues),
    ...(params.mode === 'discovery' ? [] : state.derived?.issues || []),
  ];
  for (const group of get_issue_groups(issues)) {
    lines.push('', `${group.expected ? 'Not supported for inference' : 'Needs inspection'}: ${group.code} (${plural(group.source_count, 'recorded source')})`);
    for (const row of group.rows) lines.push(`  ${row.identity}\n    ${row.message}`);
  }
  return lines.join('\n');
}

export function build_html(params = {}) {
  return `<div class="st-template-index-status">
    <div role="status" aria-live="polite">
      <p class="st-template-index-status__scope"></p>
      <p class="st-template-index-status__summary"></p>
      <p class="st-template-index-status__warning" hidden></p>
    </div>
    <details><summary>${params.mode === 'scan' ? 'Scan details' : 'Source details'}</summary><pre class="st-template-index-status__details"></pre></details>
  </div>`;
}

export async function render(templates, params = {}) {
  this.apply_style_sheet(styles);
  const container = this.create_doc_fragment(build_html(params)).firstElementChild;
  post_process.call(this, templates, container, params);
  return container;
}

export function post_process(templates, container, params = {}) {
  // Freeze a copy: later workspace focus or presenter-param mutation is irrelevant.
  const scope = { scope_source_key: params.scope_source_key ?? null };
  const summary = container.querySelector('.st-template-index-status__summary');
  const scope_el = container.querySelector('.st-template-index-status__scope');
  const warning = container.querySelector('.st-template-index-status__warning');
  const details = container.querySelector('.st-template-index-status__details');
  let disposed = false;
  let queued = false;
  const update = () => {
    if (disposed) return;
    const state = templates.get_discovery_state(scope);
    summary.textContent = params.show_summary === false ? '' : get_status_text(templates, { ...scope, mode: params.mode });
    summary.hidden = params.show_summary === false;
    scope_el.textContent = `${state?.adapter_key === 'bases' ? 'Base results for' : 'Starting note'}: ${scope.scope_source_key || 'No note selected'}`;
    scope_el.hidden = params.show_scope === false || (params.show_summary === false && state?.adapter_key !== 'bases');
    warning.textContent = get_status_warning(state, params);
    warning.hidden = !warning.textContent;
    details.textContent = get_status_details(state, params);
    // Settings do not show a healthy scan/debug report as configuration.
    const disclosure = details.parentElement;
    if (disclosure) disclosure.hidden = params.show_summary === false && !warning.textContent;
  };
  const schedule = () => {
    if (disposed || queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; update(); });
  };
  update();
  // Source invalidation changes snapshot status without a catalog commit event.
  // Only mounted presentation updates; these callbacks never read/import/scan.
  const names = ['templates:index_changed', 'sources:created', 'sources:modified', 'sources:renamed', 'sources:deleted'];
  const unsubscribers = names.map((name) => templates.env.events.on(name, schedule));
  attach_template_disposer(this, container, () => {
    disposed = true;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, params.signal);
  return container;
}

export const version = '1.0.0';
