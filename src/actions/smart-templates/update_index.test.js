import test from 'ava';
import { smart_env_config } from '../../default.config.js';
import { create_base_env } from '../../test_support/bases.js';
import { register_command_actions } from 'obsidian-smart-env/src/utils/command_actions.js';

test('P3 index action: bound action forces Base reevaluation and never invokes derivation', async (t) => {
  const { templates, reads, add_base } = create_base_env(t, { actions: smart_env_config.actions });
  add_base();
  templates.discovery_adapters.derived_headings.prepare = () => t.fail('Base update ran inference');
  const params = { scope_source_key: 'Projects/A.md' };
  await templates.prepare_templates(params);
  await templates.prepare_templates(params);
  t.is(reads.length, 1);
  t.is((await templates.actions.smart_templates_update_index(params)).status, 'ready');
  t.is(reads.length, 2);
  t.is(templates.discovery_adapters.derived_headings.get_snapshot().revision, 0);
});

test('P3 index command: actual connector acquires exact collection and freezes native scope', (t) => {
  const { templates, env } = create_base_env(t, { actions: smart_env_config.actions });
  const calls = [];
  env.config.actions = { ...env.config.actions, smart_templates_update_index: {
    ...env.config.actions.smart_templates_update_index,
    action(params) { t.is(this, templates); calls.push(params); },
  } };
  const commands = [];
  const plugin = {
    env, app: { workspace: { getActiveFile: () => ({ path: 'Clicked.md' }) } },
    manifest: { id: 'smart-templates' }, addCommand: (command) => commands.push(command),
  };
  register_command_actions(plugin);
  const command = commands.find(({ id }) => id === 'update-template-index');
  t.true(command.checkCallback(true)); t.is(calls.length, 0);
  command.checkCallback(false);
  t.is(calls.length, 1); t.is(calls[0].scope_source_key, 'Clicked.md');
  t.is(calls[0].event_source, 'command:smart-templates:update-template-index');
});
