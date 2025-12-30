import test from 'ava';
import { build_prompt_text } from './build_prompt_text.js';

const make_ctx = (text = 'Context body') => ({
  async get_text() {
    return text;
  }
});

const make_template = (template_text = 'Template body') => ({
  async get_template() {
    return template_text;
  }
});

test('returns empty prompt when context or template is missing', async t => {
  const tmpl = make_template();
  const prompt_without_ctx = await build_prompt_text(null, tmpl, 'Instructions');
  t.is(prompt_without_ctx, '');

  const ctx = make_ctx();
  const prompt_without_tmpl = await build_prompt_text(ctx, null, 'Instructions');
  t.is(prompt_without_tmpl, '');
});

test('omits template instructions when template content is missing', async t => {
  const ctx = make_ctx('Context for template');
  const tmpl = make_template(null);

  const prompt = await build_prompt_text(ctx, tmpl, 'Guide the model');

  t.false(prompt.includes('<template>'));
  t.false(prompt.includes('null'));
  t.true(prompt.startsWith('Guide the model'));
  t.true(prompt.includes('Context for template'));
  t.true(prompt.endsWith('Guide the model'));
});

test('wraps template text when present', async t => {
  const ctx = make_ctx('Context payload');
  const tmpl = make_template('Template instructions');

  const prompt = await build_prompt_text(ctx, tmpl, 'Shape output');
  const template_occurrences = (prompt.match(/<template>/g) || []).length;

  t.is(template_occurrences, 2);
  t.true(prompt.includes('Template instructions'));
  t.true(prompt.startsWith('Shape output'));
  t.true(prompt.endsWith('</template>'));
});

test('replaces vault tag placeholders in instructions', async t => {
  const ctx = make_ctx('Context payload');
  const tmpl = make_template('Template instructions');

  const prompt = await build_prompt_text(ctx, tmpl, 'Use tags {{vault_tags}}');

  t.false(prompt.includes('{{vault_tags}}'));
  t.regex(prompt, /Use tags\s+-/m);
});
