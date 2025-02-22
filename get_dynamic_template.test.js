import test from 'ava';
import { get_dynamic_template } from './get_dynamic_template.js';

/**
 * Mock Obsidian file structure for testing
 */
const mock_markdown_files = [
  { path: 'folder1/+template.md', basename: '+template', content: '# template\nFolder-level template content' },
  { path: 'folder1/file1.md', basename: 'file1', content: 'Some text\nno # template here' },
  { path: '💪 effort/emoji_template.md', basename: 'emoji_template', content: '# template\nEmoji-based template content' },
  { path: 'folder2/subfolder/+template.md', basename: '+template', content: '# template\nSubfolder template' },
  { path: 'folder2/subfolder/note.md', basename: 'note', content: '# template\nIntra-note heading template\n# other heading\nsome text' }
];

/**
 * Minimal mock vault read method
 */
async function mock_vault_read(file) {
  // In a real test, you might store your file content in an object/dict
  // so that app.vault.read can look it up.
  return file.content || '';
}

/**
 * Minimal mock fileExists
 */
async function mock_file_exists(app, path) {
  return !!mock_markdown_files.find(f => f.path === path);
}

/**
 * Minimal mock readFileContent
 */
async function mock_read_file_content(app, path) {
  const found = mock_markdown_files.find(f => f.path === path);
  if (!found) {
    console.log('File does not exist in mock vault:', path);
    return '';
  }
  return found.content;
}

/**
 * Construct a minimal mock app for testing
 */
function create_mock_app() {
  return {
    vault: {
      // We'll define getAbstractFileByPath so that read_file_content can locate it
      getAbstractFileByPath: (filePath) => {
        return mock_markdown_files.find(f => f.path === filePath) || null;
      },
      read: async (file) => await mock_vault_read(file),
      getMarkdownFiles: () => mock_markdown_files
    },
  };
}

/**
 * Setup a minimal test harness for calling get_dynamic_template
 */
function create_harness(overrides={}) {
  const base_app = create_mock_app();
  const app = { ...base_app, ...overrides };
  return { app };
}

test('Returns "No matching template." if none found', async t => {
  const { app } = create_harness();
  const result = await get_dynamic_template({
    app,
    file_path: 'folder1/unknown_file.md'
  });
  t.is(result, 'No matching template.');
});

test('Finds an intra-note # template heading if present', async t => {
  const { app } = create_harness();
  // "folder2/subfolder/note.md" itself has "# template"
  const result = await get_dynamic_template({
    app,
    file_path: 'folder2/subfolder/note.md'
  });
  t.true(result.includes('Intra-note heading template'), 'Should retrieve from the #template heading in the note file.');
});

test('Finds a +template in the same folder if no # template in the file', async t => {
  const { app } = create_harness();
  const result = await get_dynamic_template({
    app,
    file_path: 'folder1/file1.md'
  });
  t.true(result.includes('Folder-level template content'), 'Should retrieve content from folder1/+template.md');
});

test('Supports climbing up folder structure (subfolder) if no template in current folder', async t => {
  const { app } = create_harness();
  // Suppose a file in 'folder2/subfolder2' that doesn't have a local +template
  // We'll ensure it climbs up to 'folder2/subfolder/+template.md' if that existed
  // For the test, let's tweak the path
  const result = await get_dynamic_template({
    app,
    file_path: 'folder2/subfolder2/anotherNote.md'
  });
  t.is(result, 'No matching template.', 'No matching template in subfolder2 or folder2, so fallback to "No matching template."');
});

test('Emoji check: if the note name or folder is an emoji, looks in "💪 effort" folder', async t => {
  const { app } = create_harness();
  // Suppose the file name is "💡 Brainstorm.md" => first or second char is an emoji.
  // We'll pass "💡 Brainstorm.md" to see if it picks up from "💪 effort" folder
  const result = await get_dynamic_template({
    app,
    file_path: '💡 Brainstorm.md'
  });
  t.true(result.includes('Emoji-based template content'), 'Should retrieve from "💪 effort/emoji_template.md"');
});

