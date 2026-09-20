import test from 'ava';
import { create_library } from '../../test_support/library.js';

test('P5 internal read: exactly the existing string/null/compatibility result, with no Tool declaration', async (t) => {
  const { item, env } = await create_library(t);
  for (const result of ['## Body', null, 'BLOCK NOT FOUND: existing compatibility text']) {
    let count = 0;
    item.read = async () => { count += 1; return result; };
    t.is(await item.actions.template_read(), result);
    t.is(count, 1);
  }
  t.falsy(env.config.actions.template_read.tool);
});
