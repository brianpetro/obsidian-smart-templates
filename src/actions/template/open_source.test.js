import test from 'ava';
import { create_library } from '../../test_support/library.js';

test('P5-06/07: source-backed templates delegate configured navigation with exact source/block scope', async (t) => {
  const { templates, env, item } = await create_library(t);
  const calls = [];
  env.config.actions.source_open = { action(params) { calls.push({ scope: this, params }); return 'navigation result'; } };
  const source = env.smart_sources.get('Templates/Review.md'); source.env = env;
  const vault = templates.get(source.key);
  const event = {};
  t.is(await vault.actions.template_open_source({ event }), 'navigation result');
  t.is(calls[0].scope, source); t.is(calls[0].params.event, event);
  const block = Object.values(env.smart_blocks.items).find((entry) => entry.key.startsWith(source.key + '#'));
  const block_template = templates.create_or_update({ key: block.key, source_key: block.key, content: null });
  t.is(await block_template.actions.template_open_source(), 'navigation result');
  t.is(calls[1].scope, block);
  t.is(await item.actions.template_open_source(), null);
  t.is(calls.length, 2);
});

test('P5 navigation: stale source and replaced template fail rather than navigating another identity', async (t) => {
  const { templates, env } = await create_library(t);
  const item = templates.get('Templates/Review.md');
  delete env.smart_sources.items[item.key];
  await t.throwsAsync(() => item.actions.template_open_source(), { message: /unavailable/ });
  delete templates.items[item.key];
  await t.throwsAsync(() => item.actions.template_open_source(), { message: /no longer/ });
});
