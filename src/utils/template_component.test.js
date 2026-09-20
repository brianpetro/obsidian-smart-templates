import test from 'ava';
import { attach_template_disposer } from './template_component.js';

test('P5 lifecycle: abort cleans never-mounted components; later DOM disposal is idempotent', (t) => {
  let calls = 0; let removal;
  const controller = new AbortController();
  attach_template_disposer({ attach_disposer(_el, fns) { removal = fns[0]; } }, {}, () => { calls += 1; }, controller.signal);
  controller.abort(); removal();
  t.is(calls, 1);
});

test('P5 lifecycle: already aborted rendering performs immediate cleanup', (t) => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  attach_template_disposer({ attach_disposer() {} }, {}, () => { calls += 1; }, controller.signal);
  t.is(calls, 1);
});
