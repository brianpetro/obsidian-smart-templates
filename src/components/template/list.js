import styles from './list.css';
import { Menu } from 'obsidian';
import { get_template_groups } from '../../utils/template_display.js';
import { attach_template_disposer } from '../../utils/template_component.js';
import { get_template_event_paths } from '../../utils/template_base.js';
import { get_refresh_label } from '../smart-templates/index_status.js';

export function build_html() {
  return `<div class="st-templates-library">
    <header class="st-templates-library__header"><h1>Templates</h1>
      <details class="st-templates-library__scope-controls">
        <summary class="st-templates-library__scope"></summary>
        <label>Note path <input type="text" class="st-templates-library__scope-input" placeholder="Projects/Example.md"></label>
        <button type="button" data-library-action="apply-scope">Use this note</button>
        <button type="button" data-library-action="current-scope">Use current note</button>
        <p class="st-templates-library__scope-help"></p>
      </details>
    </header>
    <div class="st-templates-library__toolbar">
      <label class="st-templates-library__search">Find a template <input type="search" placeholder="Name, path, or description"></label>
      <details class="st-templates-library__maintenance"><summary>More</summary>
        <div class="st-templates-library__maintenance-actions">
          <button type="button" data-library-action="update-index" data-base-refresh>Refresh Base results</button>
          <button type="button" data-library-action="open-base">Open Base</button>
        </div>
        <p class="st-templates-library__maintenance-help"></p>
      </details>
    </div>
    <div class="st-templates-library__index"></div>
    <p class="st-templates-library__feedback" role="status" aria-live="polite"></p>
    <div class="st-templates-library__workspace">
      <div class="st-templates-library__rows" aria-label="Templates"></div>
      <div class="st-templates-library__details" hidden></div>
    </div>
  </div>`;
}

export async function render(templates, params = {}) {
  this.apply_style_sheet(styles);
  const container = this.create_doc_fragment(build_html()).firstElementChild;
  await post_process.call(this, templates, container, params);
  return container;
}

/** Collection-scoped presenter. Only the supplied leaf owns query/focus state. */
export async function post_process(templates, container, { view, signal } = {}) {
  const env = templates.env;
  const scope = { scope_source_key: view.list_state.scope_source_key };
  const state = view.list_state;
  const rows_el = container.querySelector('.st-templates-library__rows');
  const details_el = container.querySelector('.st-templates-library__details');
  const feedback = container.querySelector('.st-templates-library__feedback');
  const query_input = container.querySelector('input[type="search"]');
  const scope_input = container.querySelector('.st-templates-library__scope-input');
  const open_base_button = container.querySelector('[data-library-action="open-base"]');
  let disposed = false;
  let rows_controller = null;
  let details_controller = null;
  let details_item = null;
  let details_data = null;
  let details_pending_save = false;
  let details_feedback = '';
  let rendered_source_paths = [];
  const pending_source_paths = new Set();
  let render_queued = false;
  let busy = false;
  let focus_after = null;
  const pending_actions = new Set();
  const item_feedback = new Map();
  let built_in_open = null;
  const report = (message) => { if (!disposed) feedback.textContent = message; };
  container.querySelector('.st-templates-library__scope').textContent = `${templates.get_discovery_state(scope)?.adapter_key === 'bases' ? 'Base results / starting note' : 'Starting note'}: ${scope.scope_source_key || 'No note selected'} · Change`;
  const scope_help = container.querySelector('.st-templates-library__scope-help');
  if (scope_help) scope_help.textContent = templates.get_discovery_state(scope)?.adapter_key === 'bases'
    ? 'This note selects applicable Base results and starts a new request. An empty path uses globally available templates only.'
    : 'Used to start a new request. Recurring structures come from the last corpus scan, not recommendations for this note.';
  scope_input.value = scope.scope_source_key || '';
  query_input.value = state.query;

  const sync_controls = () => {
    if (disposed) return;
    container.querySelectorAll('[data-library-action], .st-template-row__use, [data-details-action="use"]')
      .forEach((button) => { button.disabled = busy; });
    const discovery = templates.get_discovery_state(scope);
    open_base_button.hidden = !discovery?.base_key;
    container.querySelector('.st-templates-library__maintenance').hidden = discovery?.adapter_key !== 'bases';
    const refresh = container.querySelector('[data-base-refresh]');
    if (refresh) refresh.hidden = discovery?.adapter_key !== 'bases';
    const help = container.querySelector('.st-templates-library__maintenance-help');
    if (help) help.textContent = discovery?.adapter_key === 'bases'
      ? 'Refresh after changing properties used by a Base. Automatic recurring-structure discovery is disabled under Base policy.'
      : 'Find recurring structures below to scan notes and refresh templates. No scan runs when opening or searching this library.';
  };

  const run_item_action = async (item, action_key, event) => {
    if (disposed) return;
    if (templates.get(item.key) !== item || item.deleted) throw new Error('This template is no longer available.');
    const pending_key = `${action_key}:${item.key}`;
    if (pending_actions.has(pending_key)) return;
    const placement = env.resolve_menu_actions('template:action_menu', item, { event })
      .find((entry) => entry.action_key === action_key && !entry.disabled && !entry.menu_only);
    if (!placement) throw new Error('This template action is currently unavailable.');
    pending_actions.add(pending_key);
    try {
      const retrying_save = action_key === 'template_confirm' && item.data.transient === false;
      const result = await placement.run({ event });
      if (action_key === 'template_confirm') {
        if (result !== item || item.data.transient) throw new Error('The template was not confirmed.');
        item_feedback.set(item.key, retrying_save ? 'Saving queued again.' : 'Added to your templates.');
        focus_after = { key: item.key, selector: '.st-template-row__inspect' };
      } else if (action_key === 'template_copy_markdown') item_feedback.set(item.key, 'Template Markdown copied.');
      return result;
    } catch (error) {
      item_feedback.set(item.key, error.message);
      throw error;
    } finally {
      pending_actions.delete(pending_key);
      request_rows();
    }
  };
  const run_safely = (operation) => { Promise.resolve().then(() => { if (!disposed) return operation(); }).catch((error) => report(error.message)); };
  const on_use = async (item) => {
    if (disposed || busy) return;
    busy = true; sync_controls(); report('');
    try {
      const result = await view.use_templates([item.key]);
      if (result === false) throw new Error('The Templates request flow is unavailable.');
      return result;
    } finally { busy = false; sync_controls(); }
  };

  const show_menu = (item, event) => {
    if (disposed || templates.get(item.key) !== item || item.deleted) return;
    const menu = new Menu(view.app);
    env.build_menu('template:action_menu', menu, item, {});
    env.build_menu('templates:request_menu', menu, env, {
      plugin: view.plugin, scope_source_key: scope.scope_source_key,
      context_items: scope.scope_source_key ? [scope.scope_source_key] : [],
      ignore_selection: true, selected_template_keys: [item.key],
    });
    const target = event.currentTarget || event.target;
    const bounds = target.getBoundingClientRect();
    menu.showAtPosition({ x: event.clientX || bounds.left, y: event.clientY || bounds.bottom });
  };

  const render_details = async () => {
    const item = templates.get_visible_templates(scope).find((entry) => entry.key === state.focused_template_key);
    if (item === details_item && item?.data === details_data && Boolean(item?._queue_save) === details_pending_save && item_feedback.get(item?.key) === details_feedback) return;
    details_controller?.abort();
    details_item = item; details_data = item?.data;
    details_pending_save = Boolean(item?._queue_save);
    details_feedback = item_feedback.get(item?.key);
    details_el.replaceChildren();
    details_el.hidden = !item;
    if (!item) {
      if (state.focused_template_key) report('This template is no longer available for this note.');
      return;
    }
    const controller = new AbortController();
    details_controller = controller;
    const element = await env.smart_components.render_component('template_details', item, {
      signal: controller.signal, on_use, on_action: run_item_action, feedback: details_feedback,
      on_close: () => {
        view.focus_template(null);
        focus_after = { key: item.key, selector: '.st-template-row__inspect' };
        request_rows();
      },
    });
    if (disposed || controller.signal.aborted) return;
    if (element) details_el.replaceChildren(element);
  };

  const render_rows = async () => {
    if (disposed) return;
    rows_controller?.abort();
    const controller = new AbortController();
    rows_controller = controller;
    const groups = get_template_groups(templates.get_visible_templates(scope), state.query);
    const fragment = container.ownerDocument.createDocumentFragment();
    const personal = groups.filter((group) => group.section !== 'Suggested' && group.title !== 'Built-in templates');
    const suggested = groups.filter((group) => group.section === 'Suggested');
    const built_ins = groups.filter((group) => group.title === 'Built-in templates');
    const base_mode = templates.get_discovery_state(scope)?.adapter_key === 'bases';
    const sections = [
      { title: 'Your templates', groups: personal },
      { title: 'Recurring structures', groups: suggested, scan: !base_mode },
      { title: 'Built-in templates', groups: built_ins, disclosure: true },
    ];
    for (const spec of sections) {
      if (!spec.groups.length && !spec.scan) continue;
      const section = container.ownerDocument.createElement(spec.disclosure ? 'details' : 'section');
      section.setAttribute('aria-label', spec.title);
      if (spec.disclosure) {
        const has_personal = templates.get_visible_templates(scope).some((item) => !item.data.built_in && item.data.transient !== true);
        section.open = Boolean(state.query) || (built_in_open ?? !has_personal);
        section.className = 'st-templates-library__built-ins';
        section.addEventListener('toggle', () => { if (!controller.signal.aborted && !state.query) built_in_open = section.open; });
      }
      const heading = container.ownerDocument.createElement(spec.disclosure ? 'summary' : 'h2');
      heading.textContent = spec.title;
      const scan_header = spec.scan ? container.ownerDocument.createElement('div') : section;
      if (spec.scan) { scan_header.className = 'st-templates-library__scan-header'; section.appendChild(scan_header); }
      scan_header.appendChild(heading);
      if (spec.scan) {
        const button = container.ownerDocument.createElement('button');
        button.type = 'button'; button.dataset.libraryAction = 'update-index';
        button.textContent = get_refresh_label(templates.get_discovery_state(scope));
        scan_header.appendChild(button);
        const description = container.ownerDocument.createElement('p');
        description.className = 'st-templates-library__scan-help';
        description.textContent = 'Scans represented notes and refreshes templates. Recurrence is not relevance to the starting note.';
        description.hidden = Boolean(templates.get_discovery_state(scope)?.derived?.revision);
        section.appendChild(description);
        const status = await env.smart_components.render_component('smart_templates_index_status', templates, {
          ...scope, show_scope: false, mode: 'scan', signal: controller.signal,
        });
        if (disposed || controller.signal.aborted) return;
        if (status) section.appendChild(status);
        if (!spec.groups.length) {
          const empty = container.ownerDocument.createElement('p');
          empty.textContent = state.query ? 'No recurring structures match this search.'
            : 'No unkept recurring structures are available. Inspect matching structures before keeping one.';
          section.appendChild(empty);
        }
      }
      fragment.appendChild(section);
      for (const { template_item: item } of spec.groups.flatMap((group) => group.records)) {
        if (disposed || controller.signal.aborted) return;
        const row = await env.smart_components.render_component('template_list_item', item, {
          signal: controller.signal,
          focused: state.focused_template_key === item.key,
          busy: pending_actions.has(`template_confirm:${item.key}`),
          use_disabled: busy,
          feedback: item_feedback.get(item.key),
          on_focus: () => { view.focus_template(item.key); focus_after = { key: item.key, selector: '.st-template-row__inspect' }; request_rows(); },
          on_use: () => run_safely(() => on_use(item)),
          on_action: (_item, action_key, event) => {
            void run_item_action(item, action_key, event).catch(() => { /* Feedback stays with the affected item. */ });
          },
          on_menu: (target, event) => run_safely(() => show_menu(target, event)),
        });
        if (disposed || controller.signal.aborted) return;
        if (row) section.appendChild(row);
      }
    }
    if (!groups.length) {
      const empty = container.ownerDocument.createElement('p');
      empty.textContent = state.query ? 'No templates match this search.' : 'No templates are available for this note.';
      fragment.appendChild(empty);
    }
    if (disposed || controller.signal.aborted) return;
    rows_el.replaceChildren(fragment);
    rendered_source_paths = groups.flatMap((group) => group.records
      .map(({ template_item }) => template_item.data.source_key?.split('#')[0]).filter(Boolean));
    sync_controls();
    if (focus_after) {
      const row = [...rows_el.querySelectorAll('[data-template-key]')].find((entry) => entry.dataset.templateKey === focus_after.key);
      row?.querySelector(focus_after.selector)?.focus();
      focus_after = null;
    }
    await render_details();
  };
  function request_rows() {
    if (disposed || render_queued) return;
    render_queued = true;
    queueMicrotask(() => {
      render_queued = false;
      if (!disposed) void render_rows().catch((error) => report(error.message));
    });
  }

  const on_search = () => { view.set_query(query_input.value); request_rows(); };
  const on_click = async (event) => {
    const button = event.target.closest('[data-library-action]');
    if (disposed || !button || button.disabled || busy) return;
    event.preventDefault();
    const action = button.dataset.libraryAction;
    busy = true; sync_controls(); report('');
    try {
      if (action === 'current-scope') await view.use_current_scope();
      else if (action === 'apply-scope') {
        const path = scope_input.value.trim();
        if (path && (!env.smart_sources.get(path) || env.smart_sources.get(path).deleted)) throw new Error('Choose an exact registered note path.');
        view.apply_state({ scope_source_key: path || null });
        view.save_navigation();
        await view.render_view();
      } else if (action === 'update-index') {
        report(templates.get_discovery_state(scope)?.adapter_key === 'bases' ? 'Refreshing Base results...' : 'Scanning notes for recurring structures...');
        await templates.actions.smart_templates_update_index(scope);
        report('Finished. Review the results and any reported issues below.');
      } else if (action === 'open-base') {
        if (!await templates.actions.smart_templates_open_discovery_base(scope)) throw new Error('No Base applies to this note.');
      }
    } catch (error) { report(error.message); }
    finally {
      busy = false;
      if (!disposed) { sync_controls(); request_rows(); }
    }
  };
  query_input.addEventListener('input', on_search);
  container.addEventListener('click', on_click);
  // The status component observes edits independently; details labels only its
  // own stale read. Neither needs a full row rebuild for source modifications.
  const on_source_topology = (event = {}) => {
    if (disposed || (event.collection_key && event.collection_key !== 'smart_sources')) return;
    const queued = pending_source_paths.size > 0;
    for (const path of get_template_event_paths(event)) pending_source_paths.add(path);
    if (queued || !pending_source_paths.size) return;
    queueMicrotask(() => {
      const paths = [...pending_source_paths];
      pending_source_paths.clear();
      if (disposed) return;
      // Include committed membership so recreation can restore a previously
      // hidden row. This inspects template identities only, not the source index.
      const keys = templates.active_discovery_adapter.get_snapshot(scope).visible_keys;
      const source_paths = [...rendered_source_paths, ...keys
        .map((key) => templates.get(key)?.data.source_key?.split('#')[0]).filter(Boolean)];
      if (source_paths.some((key) => paths.some((path) => key === path || key.startsWith(`${path}/`)))) request_rows();
    });
  };
  const unsubscribers = [
    env.events.on('templates:index_changed', (event = {}) => {
      if (!event.collection_key || event.collection_key === 'smart_templates') request_rows();
    }),
    // Queue completion is not a receipt: render current dirty flags, including
    // those left set by the inherited writer after an append failure.
    env.events.on('collection:save_completed', (event = {}) => {
      if (event.collection_key === 'smart_templates') request_rows();
    }),
    ...['sources:created', 'sources:renamed', 'sources:deleted']
      .map((name) => env.events.on(name, on_source_topology)),
  ];
  attach_template_disposer(this, container, () => {
    disposed = true;
    rows_controller?.abort(); details_controller?.abort();
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    query_input.removeEventListener('input', on_search);
    container.removeEventListener('click', on_click);
  }, signal);
  if (disposed) return container;
  const status = await env.smart_components.render_component('smart_templates_index_status', templates, { ...scope, show_scope: false, mode: 'discovery', signal });
  if (disposed) return container;
  if (status) container.querySelector('.st-templates-library__index').appendChild(status);
  await render_rows();
  return container;
}

export const version = '1.0.0';
