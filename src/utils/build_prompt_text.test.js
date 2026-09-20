import test from 'ava';
import { build_prompt_text } from './build_prompt_text.js';

test('P1-09: formatter preserves current order and deliberate repeated instructions/template', (t) => {
  t.is(build_prompt_text({ context_text: 'CONTEXT', template_text: 'T', user_message: 'I' }), [
    'Use the provided instructions, template, and context to produce the best possible response.',
    '- Follow the template structure and any specific instructions provided.',
    '- Ground the result in the supplied context.',
    '- Do not repeat the context in the output.',
    '- Do not mention the wrapper tags in the final answer.',
    '', '<instructions>', 'I', '</instructions>', '', '<template>', 'T', '</template>', '',
    'CONTEXT', '', '<instructions>', 'I', '</instructions>', '', '<template>', 'T', '</template>',
  ].join('\n'));
});

test('P1: formatter expands vault_tags literally outside evidence only', (t) => {
  const output = build_prompt_text({ context_text: '{{vault_tags}}', template_text: '{{vault_tags}}', vault_tags: '#$&' });
  t.true(output.includes('<template>\n#$&\n</template>'));
  t.true(output.includes('\n\n{{vault_tags}}\n\n'));
  t.is(build_prompt_text(), '');
});
