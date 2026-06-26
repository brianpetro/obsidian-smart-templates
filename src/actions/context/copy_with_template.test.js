import test from 'ava';
import {
  context_copy_with_template,
  menus,
} from './copy_with_template.js';

test('context_copy_with_template opens configured template modal with context scope', (t) => {
  const calls = [];
  class ModalClass {
    static open(ctx) {
      calls.push(ctx);
    }
  }
  const ctx = {
    env: {
      config: {
        modals: {
          template_context: {
            class: ModalClass,
          },
        },
      },
    },
  };

  t.true(context_copy_with_template.call(ctx));
  t.deepEqual(calls, [ctx]);
});

test('copy-with-template menu metadata targets Smart Context copy menu', (t) => {
  const spec = menus['smart_context:copy_menu'];

  t.is(spec.title, 'Copy with Template');
  t.is(spec.icon, 'file-plus');
  t.is(spec.order, 2);
  t.false(spec.when.call({ scope: { item_count: 0 } }));
  t.true(spec.when.call({ scope: { item_count: 1 } }));
});
