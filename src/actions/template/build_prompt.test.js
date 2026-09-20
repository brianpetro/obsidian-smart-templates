import test from 'ava';
import { template_build_prompt } from './build_prompt.js';
import { create_env } from '../../test_support/templates.js';

test('P1-01/02/03: actual item build honors selection and validates all keys before reads', async (t) => {
  const { templates, env } = create_env(t, { actions: { template_build_prompt: { action: template_build_prompt } } });
  const a = templates.create_or_update({ key: 'A', content: 'STRUCTURE A' });
  templates.create_or_update({ key: 'B', content: 'STRUCTURE B' });
  let reads = 0;
  const ctx = { env, key: 'ctx', async get_text() { reads += 1; return 'evidence'; } };
  const text = await a.actions.template_build_prompt({ ctx, selected_template_keys: ['B'] });
  t.false(text.includes('STRUCTURE A'));
  t.true(text.includes('STRUCTURE B'));
  await t.throwsAsync(() => a.actions.template_build_prompt({ ctx, selected_template_keys: [] }), { message: /at least one/ });
  await t.throwsAsync(() => a.actions.template_build_prompt({ ctx, selected_template_keys: ['B', 'missing'] }), { message: /missing/ });
  t.is(reads, 1);
});

test('P1: existing read semantics remain unchanged; metadata prompt is not hidden assembly input', async (t) => {
  const { templates, env } = create_env(t);
  const a = templates.create_or_update({ key: 'A', content: '---\nprompt: retained\nsmart template: true\n---\n## Title\n' });
  const ctx = { env, get_text: async () => '' };
  const text = await template_build_prompt.call(a, { ctx, user_message: '', instructions: 'must not win' });
  t.true(text.includes('prompt: retained'));
  t.false(text.includes('smart template: true'));
  t.false(text.includes('<instructions>'));
  t.false(text.includes('must not win'));
  t.is(await a.read(), a.data.content);
  const empty = templates.create_or_update({ key: 'empty', content: '' });
  t.is(await empty.read(), null);
});

test('P1-09: build expands tags and retains stable selected order', async (t) => {
  const { templates, env } = create_env(t);
  const a = templates.create_or_update({ key: 'A', content: '## A {{vault_tags}}' });
  templates.create_or_update({ key: 'B', content: '## B' });
  env.plugin.app.metadataCache = { getTags: () => ({ '#z': 1, '#a': 2 }) };
  const text = await template_build_prompt.call(a, { ctx: { env, get_text: async () => '' }, selected_template_keys: ['B', 'A'] });
  t.true(text.includes('## B\n\n## A #a, #z'));
});
