import test from 'ava';
import {
  context_copy_with_template,
  menus,
} from './copy_with_template.js';

test('P1-10: context_copy_with_template prepares then opens the existing context', async (t) => {
  const calls = [];
  class ModalClass {
    static open(ctx) {
      calls.push(ctx);
    }
  }
  const ctx = {
    env: {
      smart_templates: { async prepare_templates() { calls.push('prepared'); } },
      config: {
        modals: {
          template_context: {
            class: ModalClass,
          },
        },
      },
    },
  };

  t.true(await context_copy_with_template.call(ctx));
  t.deepEqual(calls, ['prepared', ctx]);
});

test('copy-with-template menu metadata targets Smart Context copy menu', (t) => {
  const spec = menus['smart_context:copy_menu'];

  t.is(spec.title, 'Copy with Template');
  t.is(spec.icon, 'file-plus');
  t.is(spec.order, 2);
  t.false(spec.when.call({ scope: { item_count: 0 } }));
  t.true(spec.when.call({ scope: { item_count: 1 } }));
});
