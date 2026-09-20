import test from 'ava';
import { get_status_text, get_status_warning, get_status_details, get_source_counts, post_process } from './index_status.js';
import { create_base_env } from '../../test_support/bases.js';
import { element, flush } from '../../test_support/template_dom.js';

function shell() {
  const root = element();
  for (const name of ['scope', 'summary', 'warning', 'details']) root.selectors.set(`.st-template-index-status__${name}`, element());
  return root;
}

test('P3 status: source-specific counts, frozen scope, last-good warning and cleanup remain explicit', async (t) => {
  const { templates, env, add_source, add_base } = create_base_env(t);
  add_source('A.md'); let failing = false;
  add_base(undefined, undefined, () => { if (failing) throw new Error('query failed'); return [{ path: 'A.md' }]; });
  const params = { scope_source_key: 'Scope.md' };
  await templates.prepare_templates(params);
  const container = shell(); let disposers;
  post_process.call({ attach_disposer: (_element, fns) => { disposers = fns; } }, templates, container, params);
  t.is(container.querySelector('.st-template-index-status__summary').textContent, '1 template from this Base · 5 built-ins');
  params.scope_source_key = 'Changed.md'; failing = true;
  await templates.refresh_templates({ scope_source_key: 'Scope.md' }); await flush();
  t.regex(container.querySelector('.st-template-index-status__warning').textContent, /last successful/);
  t.regex(container.querySelector('.st-template-index-status__details').textContent, /query failed/);
  t.is(container.querySelector('.st-template-index-status__scope').textContent, 'Base results for: Scope.md');
  disposers.forEach((fn) => fn());
  const previous = container.querySelector('.st-template-index-status__summary').textContent;
  env.events.emit('templates:index_changed'); await flush();
  t.is(container.querySelector('.st-template-index-status__summary').textContent, previous);
});

test('P4 status: inference diagnostics remain available without duplicating them in the count', async (t) => {
  const { create_heading_env } = await import('../../test_support/heading_inference.js');
  const { templates, env, blocks } = create_heading_env(t, { documents: {
    'A.md': '## Why\n## Next\n', 'B.md': '## Why\n## Next\n',
  } });
  await templates.prepare_templates();
  t.regex(get_status_details(templates.get_discovery_state()), /Scan: unprepared/);
  await templates.actions.smart_templates_update_index();
  t.regex(get_status_text(templates), /1 recurring structure/);
  t.regex(get_status_details(templates.get_discovery_state()), /Eligible notes: 2 of 2/);
  templates.handle_source_event({ reason: 'sources:modified', path: 'A.md' });
  t.regex(get_status_warning(templates.get_discovery_state()), /Recurring structures may be outdated/);
  env.config.actions = { ...env.config.actions, smart_blocks_infer_heading_templates: {
    ...env.config.actions.smart_blocks_infer_heading_templates, action() { throw new Error('model-free inference failed'); },
  } };
  blocks.refresh_actions(); await templates.actions.smart_templates_update_index();
  t.regex(get_status_warning(templates.get_discovery_state()), /last prepared suggestions/);
  t.regex(get_status_details(templates.get_discovery_state()), /model-free inference failed/);
});

test('UX-S5: counts use scoped visibility, separate kept templates, and count sections as templates not files', async (t) => {
  const { templates, add_source, add_base } = create_base_env(t, { settings: { template_headings: 'Review' } });
  const block = { key: 'A.md#Review', lines: [1, 2], data: {} };
  add_source('A.md', [block]); add_source('Dormant.md');
  add_base(undefined, undefined, () => [{ path: 'A.md' }]);
  templates.create_or_update({ key: 'Dormant.md', source_key: 'Dormant.md', content: null });
  templates.create_or_update({ key: 'Kept', source_key: null, content: '## Kept', transient: false });
  const params = { scope_source_key: 'Scope.md' }; await templates.prepare_templates(params);
  t.deepEqual(get_source_counts(templates, params), { vault: 2, built_in: 5, saved: 1, suggested: 0 });
  t.is(get_status_text(templates, params), '2 templates from this Base · 5 built-ins · 1 kept template');
});

test('UX-S6: unprepared, failed and empty are distinct; no fresh-state claim is inferred from caching', async (t) => {
  const { templates, add_base } = create_base_env(t);
  const params = { scope_source_key: 'Scope.md' };
  t.is(get_status_text(templates, params), '5 built-ins');
  t.regex(get_status_warning(templates.get_discovery_state(params)), /not been checked/);
  add_base(); await templates.prepare_templates(params);
  t.is(get_status_text(templates, params), '0 templates from this Base · 5 built-ins');
  t.is(get_status_warning(templates.get_discovery_state(params)), '');
  t.false(get_status_text(templates, params).includes('up to date'));
  templates.set_base_settings({ template_base: 'Missing.base' }); await templates.prepare_templates(params);
  t.regex(get_status_warning(templates.get_discovery_state(params)), /unavailable/);
});

test('TASK-09: grouped diagnostics retain exact source/block identities, dedupe repeats and never invent residual counts', async (t) => {
  const { get_issue_groups } = await import('./index_status.js');
  const issues = [
    { code: 'heading_syntax_unsupported', source_key: 'A.md', message: 'Indented heading' },
    { code: 'heading_syntax_unsupported', source_key: 'A.md', message: 'Indented heading' },
    { code: 'heading_syntax_unsupported', source_key: 'B.md', message: 'Ambiguous fence' },
    { code: 'source_read_failed', source_key: 'C.md', message: 'denied' },
    { code: 'block_source_missing', block_key: 'orphan#x', message: 'Missing source' },
  ];
  const groups = get_issue_groups(issues);
  t.is(groups[0].source_count, 2); t.is(groups[0].rows.length, 2); t.true(groups[0].expected);
  t.false(groups[1].expected); t.is(groups[2].rows[0].identity, 'orphan#x');
  const state = { adapter_key: 'legacy', status: 'ready', issues: [], derived: {
    status: 'ready', revision: 1, eligible_source_count: 1080, inspected_source_count: 1275, issues,
  } };
  const text = get_status_details(state, { mode: 'scan' });
  for (const value of ['A.md', 'B.md', 'C.md', 'orphan#x', 'Indented heading', 'not a complete exclusion census']) t.true(text.includes(value));
  t.notRegex(text, /195 failures|195 errors/);
  t.is(get_status_warning(state, { mode: 'discovery' }), '');
  t.is(get_status_warning(state, { mode: 'scan' }), '');
});

test('TASK-10: scan/refresh labels expose existing policy while settings omit unrelated scan reports', async (t) => {
  const { get_refresh_label } = await import('./index_status.js');
  t.is(get_refresh_label({ adapter_key: 'bases' }), 'Refresh Base results');
  t.is(get_refresh_label({ adapter_key: 'legacy' }), 'Find recurring structures');
  const state = { adapter_key: 'legacy', status: 'ready', issues: [], derived: { status: 'last_good', issues: [{ code: 'x', message: 'Scan problem' }] } };
  t.is(get_status_warning(state, { mode: 'discovery' }), '');
  t.notRegex(get_status_details(state, { mode: 'discovery' }), /Scan problem|Scan:/);
  t.regex(get_status_warning(state, { mode: 'scan' }), /last prepared/);
});
