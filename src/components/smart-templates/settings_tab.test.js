import test from 'ava';
import { build_html, wire_base_controls, get_effective_settings, get_source_summary } from './settings_tab.js';
import { create_base_env, deferred } from '../../test_support/bases.js';
import { element } from '../../test_support/template_dom.js';
import { smart_env_config } from '../../default.config.js';

function controls(t) {
  const fixture = create_base_env(t, { actions: smart_env_config.actions });
  fixture.add_base();
  const container = element();
  const fields = Object.fromEntries(['template_base', 'template_base_view', 'template_base_scopes'].map((key) => {
    const field = element(); field.value = fixture.templates.settings[key] || '';
    container.selectors.set(`[data-base-setting="${key}"]`, field);
    return [key, field];
  }));
  for (const name of ['error', 'draft', 'source', 'view']) container.selectors.set(`.st-template-base-settings__${name}`, element());
  const rules = element(); container.selectors.set('.st-template-settings__rules', rules);
  const buttons = Object.fromEntries(['apply', 'discard', 'refresh', 'open', 'create'].map((name) => {
    const button = element(); button.setAttribute('data-template-setting', name);
    return [name, button];
  }));
  container.querySelectorAll = () => Object.values(buttons);
  const controller = new AbortController();
  const changes = [];
  wire_base_controls.call({ attach_disposer() {} }, fixture.templates, container, {
    scope_source_key: 'A.md', signal: controller.signal, on_change: () => changes.push(get_effective_settings(fixture.templates)),
  });
  const input = async (key, value) => { fields[key].value = value; await container.dispatch('input'); };
  const click = (name) => container.dispatch('click', { target: { closest: () => buttons[name] }, preventDefault() {} });
  return { ...fixture, fields, rules, buttons, changes, input, click, container, controller,
    error: container.querySelector('.st-template-base-settings__error') };
}

test('P3 settings: invalid drafts do not publish or read; valid Save prepares without inference', async (t) => {
  const fixture = controls(t);
  await fixture.input('template_base', '../invalid.base');
  await fixture.click('apply');
  t.is(fixture.templates.settings.template_base, 'Templates/Catalog.base');
  t.regex(fixture.error.textContent, /exact/);
  t.is(fixture.reads.length, 0);
  await fixture.input('template_base', 'Templates/Catalog.base');
  await fixture.input('template_base_view', 'Templates');
  await fixture.click('apply');
  t.is(fixture.reads.length, 1);
  t.is(fixture.reads[0].params.this_file, 'A.md');
  t.is(fixture.error.textContent, '');
  t.true(fixture.buttons.apply.hidden);
});

test('P3 settings: authored configuration is escaped and disposed controls cannot execute', async (t) => {
  const fixture = controls(t);
  const html = build_html({ env: { smart_templates: { settings: { template_base: '"><script>bad</script>' } } } });
  t.false(html.includes('<script>')); t.true(html.includes('&lt;script&gt;'));
  fixture.controller.abort(); await fixture.click('refresh');
  t.is(fixture.reads.length, 0);
});

test('P4 settings: clearing Base configuration never invokes corpus inference or deletes stored folder rules', async (t) => {
  const fixture = controls(t);
  fixture.templates.settings.template_folder = 'Existing';
  fixture.templates.discovery_adapters.derived_headings.prepare = () => t.fail('Save ran inference');
  await fixture.input('template_base', '');
  await fixture.input('template_base_view', '');
  await fixture.input('template_base_scopes', '');
  await fixture.click('apply');
  t.is(fixture.templates.active_discovery_adapter.key, 'legacy');
  t.is(fixture.templates.discovery_adapters.derived_headings.get_snapshot().revision, 0);
  t.is(fixture.templates.settings.template_folder, 'Existing');
  t.true(fixture.buttons.open.hidden); t.false(fixture.buttons.create.hidden);
});

test('UX-S1: effective settings hide inactive folder/name rules, but keep member-heading selection', (t) => {
  const { templates } = controls(t);
  const config = templates.settings_config;
  t.deepEqual(Object.keys(get_effective_settings(templates)), ['template_headings']);
  t.is(get_effective_settings(templates).template_headings.name, 'Sections within Base results');
  t.is(templates.settings_config.template_headings.name, config.template_headings.name);
  templates.set_base_settings({ template_base: '', template_base_scopes: '' });
  t.deepEqual(Object.keys(get_effective_settings(templates)), ['template_folder', 'template_name', 'template_headings']);
  templates.set_base_settings({ template_base_scopes: 'Projects | Scoped.base' });
  t.deepEqual(Object.keys(get_effective_settings(templates)), ['template_headings']);
});

test('UX-S2: source summary resolves saved longest-folder mapping and native folder fallback without reads', (t) => {
  const { templates, env, reads } = controls(t);
  templates.set_base_settings({ template_base_scopes: 'Projects | Scoped.base | Project view' });
  t.regex(get_source_summary(templates, { scope_source_key: 'Projects/A.md' }), /Scoped.base \/ Project view/);
  t.regex(get_source_summary(templates, { scope_source_key: 'Projects-Archive/A.md' }), /Templates\/Catalog.base/);
  templates.set_base_settings({ template_base: '' });
  t.regex(get_source_summary(templates, { scope_source_key: 'Elsewhere.md' }), /none applies/);
  templates.set_base_settings({ template_base_scopes: '' });
  env.plugin = { app: { internalPlugins: { plugins: { templates: { instance: { options: { folder: 'Native templates' } } } } } } };
  t.regex(get_source_summary(templates), /Native templates/);
  t.is(reads.length, 0);
});

test('UX-S3: dirty draft disables maintenance and effective-rule controls; Discard restores without effects', async (t) => {
  const fixture = controls(t);
  t.true(fixture.buttons.apply.hidden); t.false(fixture.buttons.open.hidden); t.true(fixture.buttons.create.hidden);
  await fixture.input('template_base', 'Other.base');
  t.false(fixture.buttons.apply.hidden); t.true(fixture.buttons.refresh.disabled);
  t.true(fixture.buttons.open.disabled); t.true(fixture.rules.disabled);
  await fixture.click('refresh'); await fixture.click('open');
  t.is(fixture.reads.length, 0); t.is(fixture.templates.settings.template_base, 'Templates/Catalog.base');
  await fixture.click('discard');
  t.is(fixture.fields.template_base.value, 'Templates/Catalog.base');
  t.true(fixture.buttons.apply.hidden); t.false(fixture.rules.disabled);
  t.is(fixture.reads.length, 0);
});

test('UX-S4: pending maintenance disables fields and duplicate invocations until completion', async (t) => {
  const fixture = controls(t); const pending = deferred(); let calls = 0;
  // Override the exact configured action before rebuilding the collection proxy.
  fixture.env.config.actions.smart_templates_update_index = { action() { calls += 1; return pending.promise; } };
  fixture.templates.refresh_actions();
  const operation = fixture.click('refresh');
  t.true(fixture.fields.template_base.disabled);
  await fixture.click('refresh'); t.is(calls, 1);
  pending.resolve(); await operation;
  t.false(fixture.fields.template_base.disabled); t.false(fixture.buttons.refresh.disabled);
});

test('TASK-11: configuration leads, scans do not become settings, and heading labels reflect different policies', (t) => {
  const { templates } = controls(t);
  const html = build_html({ env: { smart_templates: templates } });
  t.true(html.indexOf('st-template-settings__rules') < html.indexOf('Advanced discovery'));
  t.notRegex(html, /suggestions available|Find recurring structures|Update index/);
  t.is(get_effective_settings(templates).template_headings.name, 'Sections within Base results');
  templates.set_base_settings({ template_base: '', template_base_view: '', template_base_scopes: '' });
  t.is(get_effective_settings(templates).template_headings.name, 'Matching headings');
  t.is(templates.settings_config.template_headings.name, 'Template headings');
});
