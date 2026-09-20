import test from 'ava';
import { context_suggest_templates } from './templates.js';
import { create_env } from '../../test_support/templates.js';

test('P2-17: suggestions consume catalog visibility and redispatch through the configured action', async (t) => {
  const { templates, env } = create_env(t);
  templates.init();
  const selected = [];
  let redispatched = 0;
  const modal = {
    env,
    setInstructions() {},
    get_selected_template_keys: () => selected,
    toggle_selected_template_key: (key) => selected.push(key),
  };
  const ctx = { env, actions: { context_suggest_templates: () => { redispatched += 1; return ['overridden']; } } };
  const rows = context_suggest_templates.call(ctx, { modal });
  t.is(rows.length, 5);
  t.deepEqual(rows[0].select_action(), ['overridden']);
  t.is(redispatched, 1);
});
