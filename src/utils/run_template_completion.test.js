import test from 'ava';
import { run_template_completion } from './run_template_completion.js';

const fake_completion = { init_opts: null, async init(opts){ this.init_opts = opts; } };

test('run_template_completion initializes with streaming', async t => {
  const fake_thread = { init_completion(){ return fake_completion; } };
  const env = { smart_templates: { active_thread: fake_thread }, smart_chat_threads: {} };
  const tmpl = { key: 'tmpl' };
  const handlers = { chunk(){}, done(){} };
  const completion = await run_template_completion(env, tmpl, 'ctx', 'msg', handlers);
  t.true(completion.init_opts.stream);
  t.is(completion.init_opts.stream_handlers, handlers);
});

test('run_template_completion accepts chat_thread', async t => {
  const provided = { init_completion(){ return fake_completion; } };
  let created = false;
  const env = { smart_templates: {}, smart_chat_threads: { async create_or_update(){ created = true; return {}; } } };
  const tmpl = { key: 'tmpl2' };
  await run_template_completion(env, tmpl, 'ctx2', 'msg', {}, provided);
  t.false(created);
});
