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
  t.deepEqual(menus['smart_context:copy_menu'], {
    title: 'Copy with Template',
    icon: 'file-plus',
    order: 2,
    when: menus['smart_context:copy_menu'].when,
  });
});

test('copy-with-template menu predicate requires active context items', (t) => {
  const menu_spec = menus['smart_context:copy_menu'];

  t.false(menu_spec.when.call({ scope: { item_count: 0 } }));
  t.true(menu_spec.when.call({ scope: { item_count: 1 } }));
});
