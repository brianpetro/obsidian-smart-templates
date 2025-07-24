import test from 'ava';
import { build_template_completion } from './build_template_completion.js';

const FakeCompletion = class { constructor(data){ this.data = data; } async init(){} };

test('build_template_completion uses active thread', async t => {
  const fake_thread = { init_completion(data){ return new FakeCompletion(data); } };
  const env = { smart_templates: { active_thread: fake_thread }, smart_chat_threads: {} };
  const tmpl = { key: 'tmpl1' };
  const completion = await build_template_completion(env, tmpl, 'ctx1', 'msg');
  t.is(completion.data.template_key, 'tmpl1');
  t.is(env.smart_templates.active_thread, fake_thread);
});
