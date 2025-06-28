import test from 'ava';
import { SmartTemplate } from './smart_template.js';

/**
 * Creates a mock environment with:
 *  - a mock 'smart_sources' collection
 *  - a mock 'smart_templates' object that includes .settings
 *  - readFileFunc: function returning file content
 * The 'source_item' is found via env.smart_sources.get(key).
 */
function makeMockEnv(readFileFunc = null, settings = {}) {
  const sources = {
    items: {},
    get(key) {
      return this.items[key];
    }
  };
  
  const env = {
    smart_sources: sources,
    smart_templates: {
      settings: {
        template_name: '',
        template_heading: '',
        system_prompt_heading: '',
        merge_parent_templates: false,
        ...settings
      }
    }
  };
  env.create_env_getter = (obj) => { obj.env = env; };

  // Add a helper to register a 'source_item'
  // Each item must implement a 'read()' method
  env.registerSourceItem = (key, content) => {
    sources.items[key] = {
      path: key,
      async read() {
        if (readFileFunc) {
          return readFileFunc(key, content);
        }
        // default is just return 'content'
        return content;
      }
    };
  };

  return env;
}

test('get_template() returns null if source_item not found', async t => {
  const env = makeMockEnv();
  const tmpl = new SmartTemplate(env, { key: 'my_template', source_key: 'non_existent.md' });
  const result = await tmpl.get_template();
  t.is(result, null, 'Should return null if the source_item is missing');
});

test('get_template() returns null if read throws error', async t => {
  const env = makeMockEnv(() => {
    throw new Error('Simulated read error');
  });
  env.registerSourceItem('someFile.md', '---');
  
  const tmpl = new SmartTemplate(env, { key: 'my_template', source_key: 'someFile.md' });
  const result = await tmpl.get_template();
  t.is(result, null, 'Should return null if read fails with an error');
});

test('get_template() returns trimmed content if no special headings set', async t => {
  const CONTENT = `
# Title

Hello world
`.trim();
  const env = makeMockEnv();
  env.registerSourceItem('note.md', CONTENT);

  const tmpl = new SmartTemplate(env, { key: 'tmpl', source_key: 'note.md' });
  const result = await tmpl.get_template();
  t.is(result, CONTENT, 'Should return the entire content trimmed');
});

test('get_template() uses template_heading to extract only that block', async t => {
  const CONTENT = `
# Intro
Intro content

## TargetHeading
Target content line 1
Target content line 2

## AnotherHeading
Ignore this
`.trim();

  const env = makeMockEnv();
  env.smart_templates.settings.template_heading = 'TargetHeading';
  env.registerSourceItem('note.md', CONTENT);

  const tmpl = new SmartTemplate(env, { key: 'tmpl', source_key: 'note.md' });
  const result = await tmpl.get_template();

  const expected = `Target content line 1
Target content line 2`;
  t.is(result, expected, 'Should return only the block under TargetHeading');
});

test('get_template() returns empty if template_heading not found', async t => {
  const CONTENT = `
# SomeHeading
Content
`;
  const env = makeMockEnv();
  env.smart_templates.settings.template_heading = 'NotThere';
  env.registerSourceItem('doc.md', CONTENT);

  const tmpl = new SmartTemplate(env, { key: 'tmpl', source_key: 'doc.md' });
  const result = await tmpl.get_template();

  t.is(result, '', 'No matching heading => empty string');
});

test('get_template() removes system_prompt_heading block', async t => {
  const CONTENT = `
# Intro
Intro text

## SystemHeading
system stuff to remove
line2

## RealHeading
Keep me
`.trim();

  const env = makeMockEnv();
  env.smart_templates.settings.system_prompt_heading = 'SystemHeading';
  env.registerSourceItem('doc.md', CONTENT);

  const tmpl = new SmartTemplate(env, { source_key: 'doc.md' });
  const result = await tmpl.get_template();

  t.false(result.includes('system stuff to remove'), 'SystemHeading block removed');
  t.true(result.includes('Intro text'), 'Other content remains');
  t.true(result.includes('## RealHeading'), 'Subsequent heading remains');
});

test('get_template() can apply both template_heading extraction and system_prompt removal', async t => {
  const CONTENT = `
# Intro
some

## SystemPrompt
should remove me
and more lines

## TheOne
Here is the content to keep
But also remove anything after next heading

## Extra
Ignore
`.trim();

  const env = makeMockEnv();
  env.smart_templates.settings.template_heading = 'TheOne';
  env.smart_templates.settings.system_prompt_heading = 'SystemPrompt';
  env.registerSourceItem('file.md', CONTENT);

  const tmpl = new SmartTemplate(env, { source_key: 'file.md' });
  const result = await tmpl.get_template();

  t.false(result.includes('SystemPrompt'), 'System prompt heading is removed entirely');
  t.true(result.includes('Here is the content to keep'), 'TheOne heading is kept');
  t.false(result.includes('Ignore'), 'No content after TheOne heading block is included');
});

