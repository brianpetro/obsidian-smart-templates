import test from 'ava';
import { build_html } from './template_context_builder.js';

test('build_html includes context key and edit button', t => {
  const ctx = { data: { key: 'ctx1' } };
  const html = build_html(ctx);
  t.true(html.includes('ctx1'));
  t.true(html.includes('st-edit-context'));
});
