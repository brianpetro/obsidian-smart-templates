import test from 'ava';
import { get_dynamic_template } from './get_dynamic_template.js';

/**
 * Mock environment objects for testing
 */
function create_mock_env(template_heading=null) {
  return {
    smart_templates: {
      settings: {
        template_heading
      }
    },
    // For the upward folder search in a real environment, we might
    //  use env.smart_sources or something else. For now we only
    //  rely on the 'fs' from source_item.collection.fs to read files.
  };
}

/**
 * A minimal in-memory FS for testing
 */
class MockFs {
  constructor(files={}) {
    this.files = files; // { "folder/fileName.md": "content..." }
  }
  async exists(path) {
    return this.files.hasOwnProperty(path);
  }
  async read(path) {
    return this.files[path] || '';
  }
}

/**
 * Minimal source item
 */
function create_source_item(path, fsInstance) {
  return {
    path,
    collection: {
      fs: fsInstance
    }
  };
}

test('Returns "No matching template." if no template_heading is set and no fallback file', async t => {
  const fs = new MockFs({ /* no files at all */ });
  const source_item = create_source_item('folder/current.md', fs);
  const env = create_mock_env(null); // no template_heading
  const result = await get_dynamic_template({ source_item, env });
  t.is(result, 'No matching template.', 'Should immediately return no match if template_heading not set and no fallback logic used.');
});

test('Extracts content from an intra-note heading if template_heading is set and found', async t => {
  const fs = new MockFs({
    'folder/current.md': `
# Some heading
Content not needed

## desired_heading
This is the template content line1
This is line2
## Another heading
Rest
    `.trim()
  });
  const source_item = create_source_item('folder/current.md', fs);
  const env = create_mock_env('desired_heading');
  const result = await get_dynamic_template({ source_item, env });
  t.true(result.includes('template content line1'), 'Should retrieve lines after heading');
  t.false(result.includes('desired_heading'), 'Should not include the heading line itself');
});

test('If heading not found in current file, looks for "desired_heading.md" upward', async t => {
  const fs = new MockFs({
    'folder/desired_heading.md': '# external template\nfrom file content',
    'folder/current.md': '# some heading\nsome text'
  });
  const source_item = create_source_item('folder/current.md', fs);
  const env = create_mock_env('desired_heading');
  const result = await get_dynamic_template({ source_item, env });
  t.true(result.includes('external template'), 'Should retrieve from external file if heading not found in current file');
});

test('Searches parent folders until root for the named template', async t => {
  const fs = new MockFs({
    'folder1/folder2/desired_heading.md': '# deeper template\nsome deeper lines',
    'folder1/folder2/current.md': '# no heading\nstuff',
    'folder1/desired_heading.md': '# fallback template\nsome fallback lines'
  });
  // If "folder1/folder2/desired_heading.md" does not exist, it should find "folder1/desired_heading.md"
  const source_item = create_source_item('folder1/folder2/current.md', fs);

  // let's remove the deeper file so we can confirm it climbs up
  delete fs.files['folder1/folder2/desired_heading.md'];

  const env = create_mock_env('desired_heading');
  const result = await get_dynamic_template({ source_item, env });
  t.true(result.includes('fallback'), 'Should climb to parent folder to find the file');
});

test('Return "No matching template." if no heading in file and no upward file found', async t => {
  const fs = new MockFs({
    'folder/current.md': '# random heading\nsome text'
  });
  const source_item = create_source_item('folder/current.md', fs);
  const env = create_mock_env('nonExistentHeading');
  const result = await get_dynamic_template({ source_item, env });
  t.is(result, 'No matching template.');
});
