import test from 'ava';
import { template_open_context, commands, ribbon_icons } from './open_context.js';

test('P1-10: command and ribbon preserve environment scope and forward semantic params', async (t) => {
  const env = { smart_templates: {}, smart_contexts: {} };
  const requests = [];
  const plugin = { manifest: { id: 'smart-templates' }, open_template_context_modal(params) { requests.push(params); return 'modal'; } };
  for (const placement of [commands['open-template-context'], ribbon_icons.open_template_context]) {
    t.true(placement.register_when({ plugin }));
    t.is(placement.get_scope({ env }), env);
    const params = { ...placement.params({ plugin }), source_key: 'Clicked.md', context_items: [], selected_template_keys: ['A'], user_message: '' };
    t.is(await template_open_context.call(env, params), 'modal');
  }
  t.deepEqual(requests[0], { source_key: 'Clicked.md', context_items: [], selected_template_keys: ['A'], user_message: '' });
  t.deepEqual(requests[0], requests[1]);
  t.false(template_open_context.call(env));
});
