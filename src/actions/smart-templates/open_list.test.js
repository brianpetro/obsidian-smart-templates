import test from 'ava';
import { smart_templates_open_list, commands } from './open_list.js';
import { create_library } from '../../test_support/library.js';

test('P5-01: configured collection action uses registered view helper and freezes the current source', async (t) => {
  const { templates, plugin, set_active_path } = await create_library(t);
  const calls = [];
  plugin.open_templates_list = (params) => calls.push(params);
  t.true(templates.actions.smart_templates_open_list({ plugin }));
  set_active_path('B.md');
  t.is(calls[0].scope_source_key, 'A.md');
  t.true(templates.actions.smart_templates_open_list({ scope_source_key: null, focused_template_key: 'Saved' }));
  t.deepEqual(calls[1], { scope_source_key: null, focused_template_key: 'Saved', state: { scope_source_key: null, focused_template_key: 'Saved' } });
  t.true(commands['browse-templates'].register_when({ plugin }));
});

test('P5-01: unavailable/unloaded library does not report an opening', async (t) => {
  const { templates, plugin } = await create_library(t);
  t.false(smart_templates_open_list.call(templates, { plugin }));
  templates.unload(); plugin.open_templates_list = () => t.fail('opened after unload');
  t.false(smart_templates_open_list.call(templates, { plugin }));
});


test('P5 registration: real SmartItemView helper reveals one leaf and carries frozen native state', async (t) => {
  const { TemplatesListView } = await import('../../views/templates_list_view.js');
  const { element } = await import('../../test_support/template_dom.js');
  const { templates, plugin } = await create_library(t);
  const registrations = {}; const leaves = []; const states = [];
  let created = 0; let revealed = 0;
  plugin.app.viewRegistry = { viewByType: {} };
  plugin.registerView = (type, callback) => { registrations[type] = callback; plugin.app.viewRegistry.viewByType[type] = true; };
  plugin.addCommand = () => t.fail('automatic view command must be skipped');
  plugin.register = (dispose) => t.teardown(dispose);
  Object.assign(plugin.app.workspace, {
    onLayoutReady(callback) { callback(); },
    getLeavesOfType(type) { return leaves.filter((leaf) => leaf.type === type); },
    getLeaf(location) {
      t.is(location, 'tab'); created += 1;
      const leaf = { async setViewState(state) {
        leaf.type = state.type; states.push(state);
        if (!leaf.view) {
          leaf.view = registrations[state.type](leaf);
          Object.defineProperty(leaf.view, 'container', { value: element() });
          leaf.view.render_view_when_ready = (params) => { leaf.last_params = params; };
        }
      } };
      leaves.push(leaf); return leaf;
    },
    revealLeaf() { revealed += 1; },
  });
  TemplatesListView.register_item_view(plugin, { skip_command_registration: true });
  t.true(templates.actions.smart_templates_open_list({ plugin, scope_source_key: 'A.md' }));
  await new Promise((resolve) => setTimeout(resolve, 120));
  t.true(templates.actions.smart_templates_open_list({ plugin, scope_source_key: 'B.md' }));
  await new Promise((resolve) => setTimeout(resolve, 120));
  t.is(created, 1); t.is(revealed, 2);
  t.is(states[0].state.scope_source_key, 'A.md');
  t.is(states[1].state.scope_source_key, 'B.md');
  t.is(leaves[0].last_params.scope_source_key, 'B.md');
});
