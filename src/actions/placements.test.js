import test from 'ava';
import { smart_env_config } from '../default.config.js';
import { TransientAjsonSingleFileCollectionDataAdapter } from '../adapters/data/transient_ajson_single_file.js';

test('P1-P5: final config adds native library actions without public Tools and retains the local adapter', (t) => {
  t.deepEqual(Object.keys(smart_env_config.actions).sort(), [
    'context_copy_with_template', 'context_suggest_templates',
    'smart_blocks_infer_heading_templates', 'smart_templates_create_base', 'smart_templates_open_discovery_base', 'smart_templates_open_list', 'smart_templates_update_index', 'template_build_prompt', 'template_confirm', 'template_copy_markdown', 'template_copy_with_context', 'template_open_context', 'template_open_source', 'template_read',
  ]);
  t.is(smart_env_config.collections.smart_templates.data_adapter, TransientAjsonSingleFileCollectionDataAdapter);
  t.true(Boolean(smart_env_config.collections.context_items.context_item_adapters.InlineTextContextItemAdapter));
  t.truthy(smart_env_config.actions.template_confirm);
  t.truthy(smart_env_config.actions.smart_blocks_infer_heading_templates);
  t.true(Object.values(smart_env_config.actions).every((entry) => !entry.tool));
});

test('P1-10: real shared command/ribbon connectors preserve checking, idempotency and exact scope', async (t) => {
  const { register_command_actions } = await import('obsidian-smart-env/src/utils/command_actions.js');
  const { register_ribbon_actions } = await import('obsidian-smart-env/src/utils/ribbon_actions.js');
  const { create_env } = await import('../test_support/templates.js');
  const { env } = create_env(t, { actions: smart_env_config.actions });
  env.smart_contexts = {};
  const calls = [];
  const commands = [];
  const ribbons = [];
  const entry = env.config.actions.template_open_context;
  env.config.actions = { ...env.config.actions, template_open_context: {
    ...entry,
    action(params) { t.is(this, env); calls.push(params); return true; },
  } };
  const plugin = {
    env, app: {}, manifest: { id: 'smart-templates' },
    addCommand: (command) => commands.push(command),
    addRibbonIcon: (icon, label, callback) => ribbons.push(callback),
  };
  register_command_actions(plugin);
  register_command_actions(plugin);
  register_ribbon_actions(plugin);
  register_ribbon_actions(plugin);
  t.is(commands.length, 3);
  const open_command = commands.find((command) => command.id === 'open-template-context');
  t.is(ribbons.length, 1);
  t.true(open_command.checkCallback(true));
  t.is(calls.length, 0);
  open_command.checkCallback(false);
  ribbons[0]({});
  t.is(calls.length, 2);
  t.is(calls[0].plugin, plugin);
  t.is(calls[0].event_source, 'command:smart-templates:open-template-context');
  t.is(calls[1].event_source, 'ribbon:smart-templates:open_template_context');
});
