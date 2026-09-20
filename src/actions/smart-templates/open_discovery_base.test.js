import test from 'ava';
import { smart_env_config } from '../../default.config.js';
import { create_base_env } from '../../test_support/bases.js';

test('P3 Open Base: scoped mapping invokes configured source navigation, not a query', async (t) => {
  const { templates, reads, add_base } = create_base_env(t, { actions: smart_env_config.actions,
    settings: { template_base_scopes: 'Projects | Projects.base | Work' },
  });
  let opened = 0;
  const source = add_base('Projects.base', ['Work']);
  source.actions = { source_open: () => { opened += 1; } };
  const result = await templates.actions.smart_templates_open_discovery_base({ scope_source_key: 'Projects/A.md' });
  t.is(result, source); t.is(opened, 1); t.is(reads.length, 0);
});

test('P3 Open Base: absent mapping returns null; missing configured source fails', async (t) => {
  const { templates } = create_base_env(t, { actions: smart_env_config.actions,
    settings: { template_base: '', template_base_scopes: 'Projects | Projects.base' },
  });
  t.is(await templates.actions.smart_templates_open_discovery_base({ scope_source_key: 'Other.md' }), null);
  await t.throwsAsync(() => templates.actions.smart_templates_open_discovery_base({ scope_source_key: 'Projects/A.md' }), { message: /unavailable/ });
});
