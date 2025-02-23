import test from 'ava';
import { get_dynamic_template } from './get_dynamic_template.js';

/**
 * Minimal mock FS that we can manipulate.
 */
class MockFs {
  constructor(files = {}) {
    this.files = files; // { "folder/fileName.md": "content..." }
  }
  async exists(path) {
    return Object.prototype.hasOwnProperty.call(this.files, path);
  }
  async read(path) {
    return this.files[path] || '';
  }
}

/**
 * Minimal mock source_item
 */
function create_source_item(path, fs, env) {
  return {
    path,
    collection: {
      fs
    },
    env
  };
}

/**
 * Creates an env object with the given settings (for testing).
 */
function create_mock_env(settings = {}) {
  return {
    smart_templates: {
      settings
    }
  };
}

test('Returns "No matching template." if no heading found and no fallback files', async t => {
  const fs = new MockFs({
    'folder/current.md': '# some heading\nsome text'
  });
  const env = create_mock_env({ template_heading: 'missing_heading' });
  const source_item = create_source_item('folder/current.md', fs, env);

  const result = await get_dynamic_template({ source_item });
  t.is(result, 'No matching template.');
});

test('Extracts content after the heading if found in current file', async t => {
  const fs = new MockFs({
    'folder/current.md': `
# random
stuff
## target_heading
Line A
Line B
## next
something
`.trim()
  });
  const env = create_mock_env({ template_heading: 'target_heading' });
  const source_item = create_source_item('folder/current.md', fs, env);

  const result = await get_dynamic_template({ source_item });
  t.regex(result, /Line A/, 'Should include lines after heading');
  t.false(result.includes('target_heading'), 'Should omit the heading line itself');
  t.false(result.includes('## next'), 'Should stop at the next heading');
});

test('Searches upward for {{template_heading}}.md if not in the current file', async t => {
  const fs = new MockFs({
    'folder/current.md': '# random heading\nsome text',
    'folder/template_for_me.md': '# external template\nsome lines'
  });
  const env = create_mock_env({ template_heading: 'template_for_me' });
  const source_item = create_source_item('folder/current.md', fs, env);

  const result = await get_dynamic_template({ source_item });
  t.regex(result, /external template/, 'Should find template_for_me.md upward');
});

test('Stops if it finds the first parent folder match (no merge_parent_templates)', async t => {
  // no merges -> it returns the first found
  const fs = new MockFs({
    'folder/subfolder/current.md': '# heading\nsome text',
    'folder/subfolder/template_stuff.md': '# subfolder template\nstuff',
    'folder/template_stuff.md': '# parent folder template\nstuff'
  });
  const env = create_mock_env({ template_heading: 'template_stuff' });
  const source_item = create_source_item('folder/subfolder/current.md', fs, env);

  const result = await get_dynamic_template({ source_item });
  t.regex(result, /subfolder template/, 'Should find subfolder first, ignoring parent folder template');
});

test('If merge_parent_templates is true, merges content from deeper folder up to root (reverse order)', async t => {
  const fs = new MockFs({
    'folder/subfolder/current.md': '# heading\nsome text',
    'folder/subfolder/template_head.md': '# subfolder template\nstuff subfolder',
    'folder/template_head.md': '# parent folder template\nstuff parent'
  });
  // 'template_head' is the name
  const env = create_mock_env({
    template_heading: 'template_head',
    merge_parent_templates: true
  });
  const source_item = create_source_item('folder/subfolder/current.md', fs, env);

  const result = await get_dynamic_template({ source_item });

  t.true(result.includes('subfolder template'), 'Should include subfolder content');
  t.true(result.includes('parent folder template'), 'Should also include parent folder content');
  t.true(
    result.indexOf('parent folder template') < result.indexOf('subfolder template'),
    'Closest to root (parent) should come first in the final output'
  );
});

test('Checks +template.md fallback if no heading or named file found', async t => {
  const fs = new MockFs({
    'folder/subfolder/current.md': '# heading\nsome text',
    'folder/subfolder/+template.md': '# subfolder fallback template\nstuff subfolder fallback'
  });
  const env = create_mock_env({ template_heading: 'nonExistentHeading' });
  const source_item = create_source_item('folder/subfolder/current.md', fs, env);

  const result = await get_dynamic_template({ source_item });
  t.regex(result, /subfolder fallback template/, 'Should retrieve from +template.md as fallback');
});

test('If everything fails, returns "No matching template."', async t => {
  const fs = new MockFs({
    'folder/current.md': '# random\nstuff'
  });
  const env = create_mock_env({
    template_heading: 'someHeading'
    // no merges, no fallback
  });
  const source_item = create_source_item('folder/current.md', fs, env);

  const result = await get_dynamic_template({ source_item });
  t.is(result, 'No matching template.');
});
