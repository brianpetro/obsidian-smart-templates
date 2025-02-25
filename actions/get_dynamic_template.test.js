import test from 'ava';
import { get_dynamic_template } from './get_dynamic_template.js';

/**
 * Helper function that simulates the 'smart_sources' collection.
 * This in-memory collection implements a 'filter' method
 * that can handle either an object with 'key_starts_with'
 * and 'key_ends_with', or a callback function.
 */
function create_smart_sources(items = []) {
  return {
    items,
    filter(arg) {
      if (typeof arg === 'function') {
        return this.items.filter(arg);
      }
      const { key_starts_with, key_ends_with } = arg;
      return this.items.filter(i => {
        const startsMatch = key_starts_with
          ? i.path.startsWith(key_starts_with)
          : true;
        const endsMatch = key_ends_with
          ? i.path.endsWith(key_ends_with)
          : true;
        return startsMatch && endsMatch;
      });
    }
  };
}

/**
 * Utility: Make a source_item with given env, path, and read content.
 */
function make_source_item(path, env, content) {
  return {
    path,
    env,
    async read() {
      return content;
    }
  };
}

test('returns "No matching template." when source_item is missing', async t => {
  const result = await get_dynamic_template(null);
  t.is(result, 'No matching template.');
});

test('returns "No matching template." when env is missing', async t => {
  const source_item = {
    path: 'folder/subfolder/file.md'
  };
  const result = await get_dynamic_template(source_item);
  t.is(result, 'No matching template.');
});

test('returns null when no templates match', async t => {
  const env = {
    smart_sources: create_smart_sources([
      // Non-matching template items
      {
        path: 'some/unrelated/file.md',
        async read() { return 'This is an unrelated file.'; }
      }
    ]),
    smart_templates: {
      settings: {
        template_name: 'folder_template',
        merge_parent_templates: false
      }
    }
  };
  const source_item = {
    path: 'folder/subfolder/file.md',
    env
  };

  const result = await get_dynamic_template(source_item);
  t.is(result, null);
});

test('returns content from a single matching template when merge=false', async t => {
  const env = {
    smart_sources: create_smart_sources([
      {
        path: 'folder/subfolder/folder_template.md',
        async read() { return 'Subfolder template content'; }
      },
      {
        path: 'other_folder/folder_template.md',
        async read() { return 'Other folder template'; }
      }
    ]),
    smart_templates: {
      settings: {
        template_name: 'folder_template',
        merge_parent_templates: false
      }
    }
  };
  const source_item = {
    path: 'folder/subfolder/file.md',
    env
  };

  const result = await get_dynamic_template(source_item);
  t.is(result, 'Subfolder template content');
});

test('chooses longest path match first when multiple possible (merge=false)', async t => {
  const env = {
    smart_sources: create_smart_sources([
      {
        path: 'folder/subfolder/folder_template.md',
        async read() { return 'Subfolder template content'; }
      },
      {
        path: 'folder/folder_template.md',
        async read() { return 'Folder template content'; }
      },
      {
        path: 'folder/subfolder/deeper/folder_template.md',
        async read() { return 'Deeper folder template'; }
      }
    ]),
    smart_templates: {
      settings: {
        template_name: 'folder_template',
        merge_parent_templates: false
      }
    }
  };
  const source_item = {
    path: 'folder/subfolder/deeper/file.md',
    env
  };

  // Should return 'folder/subfolder/deeper/folder_template.md' since it's the longest path match
  const result = await get_dynamic_template(source_item);
  t.is(result, 'Deeper folder template');
});

test('merges content from child folder up to root when merge=true', async t => {
  const env = {
    smart_sources: create_smart_sources([
      {
        path: 'folder/subfolder/folder_template.md',
        async read() { return 'Subfolder template'; }
      },
      {
        path: 'folder/folder_template.md',
        async read() { return 'Folder-level template'; }
      },
      {
        path: 'folder_template.md',
        async read() { return 'Root-level template'; }
      }
    ]),
    smart_templates: {
      settings: {
        template_name: 'folder_template',
        merge_parent_templates: true
      }
    }
  };
  const source_item = {
    path: 'folder/subfolder/file.md',
    env
  };

  /*
    Merge order with merge_parent_templates=true (child -> parent -> root):
      1) folder/subfolder/folder_template.md
      2) folder/folder_template.md
      3) folder_template.md
  */
  const result = await get_dynamic_template(source_item);
  t.true(result.includes('Subfolder template'));
  t.true(result.includes('Folder-level template'));
  t.true(result.includes('Root-level template'));

  const subIndex = result.indexOf('Subfolder template');
  const folderIndex = result.indexOf('Folder-level template');
  const rootIndex = result.indexOf('Root-level template');
  t.true(subIndex < folderIndex);
  t.true(folderIndex < rootIndex);
});

test('returns content from heading if settings.template_heading is set and heading is found', async t => {
  const source_content = `# Intro

Some introduction text.

## MyHeading

This is my special heading content
continues on next line

## AnotherHeading
some other section
`;

  const env = {
    smart_sources: create_smart_sources([]),
    smart_templates: {
      settings: {
        template_heading: 'MyHeading'
      }
    }
  };

  const source_item = {
    path: 'folder/subfolder/file.md',
    env,
    async read() {
      return source_content;
    }
  };

  const result = await get_dynamic_template(source_item);
  t.truthy(result);
  t.true(result.includes('This is my special heading content'));
  t.false(result.includes('# MyHeading'));
  t.false(result.includes('## AnotherHeading'));
});

test('returns null if no heading found and no file templates present', async t => {
  const env = {
    smart_sources: create_smart_sources([]),
    smart_templates: {
      settings: {
        template_heading: 'NonExistentHeading',
        template_name: 'folder_template'
      }
    }
  };
  const source_item = {
    path: 'folder/subfolder/file.md',
    env,
    async read() {
      return '# AnotherHeading\nsome content here.';
    }
  };

  const result = await get_dynamic_template(source_item);
  t.is(result, null);
});

test('falls back to file-based logic if template_heading is set but heading not found', async t => {
  const env = {
    smart_sources: create_smart_sources([
      {
        path: 'folder/subfolder/folder_template.md',
        async read() { return 'Subfolder folder_template content'; }
      }
    ]),
    smart_templates: {
      settings: {
        template_heading: 'NotPresentHeading',
        template_name: 'folder_template',
        merge_parent_templates: false
      }
    }
  };
  const source_item = {
    path: 'folder/subfolder/file.md',
    env,
    async read() {
      return '# Different heading\nsome content';
    }
  };

  const result = await get_dynamic_template(source_item);
  t.is(result, 'Subfolder folder_template content');
});

test('if merge_parent_templates=true and heading is found, parent templates come first, then heading last', async t => {
  const file_content = `# Intro

Text under Intro

## MyHeading
Heading-based template content line 1
Heading-based template content line 2
`;
  const env = {
    smart_sources: create_smart_sources([
      {
        path: 'folder/subfolder/folder_template.md',
        async read() { return 'Subfolder folder template'; }
      },
      {
        path: 'folder/folder_template.md',
        async read() { return 'Parent folder template'; }
      }
    ]),
    smart_templates: {
      settings: {
        template_heading: 'MyHeading',
        merge_parent_templates: true,
        template_name: 'folder_template'
      }
    }
  };
  const source_item = {
    path: 'folder/subfolder/file.md',
    env,
    async read() {
      return file_content;
    }
  };

  const result = await get_dynamic_template(source_item);
  t.truthy(result);

  // Check partial contents
  t.true(result.includes('Subfolder folder template'));
  t.true(result.includes('Parent folder template'));
  t.true(result.includes('Heading-based template content line 1'));

  // Ensure heading-based content is appended last
  const subIndex = result.indexOf('Subfolder folder template');
  const parentIndex = result.indexOf('Parent folder template');
  const headingIndex = result.indexOf('Heading-based template content line 1');

  t.true(subIndex < parentIndex);
  t.true(parentIndex < headingIndex);
});

test('if template file has a heading matching settings.template_heading, only that portion is used', async t => {
  const folderTemplate = `# SomeHeading
Ignore me

## ActualTemplate
This is the important content
Still inside the heading

## AnotherHeading
Ignore me
`;

  const env = {
    smart_sources: create_smart_sources([
      {
        path: 'folder/subfolder/folder_template.md',
        async read() { return folderTemplate; }
      }
    ]),
    smart_templates: {
      settings: {
        template_name: 'folder_template',
        merge_parent_templates: false,
        template_heading: 'ActualTemplate'
      }
    }
  };

  const source_item = make_source_item(
    'folder/subfolder/file.md',
    env,
    '# UnrelatedFileHeading\nFile content'
  );
  const result = await get_dynamic_template(source_item);

  t.truthy(result);
  t.true(result.includes('This is the important content'));
  t.false(result.includes('# SomeHeading'));
  t.false(result.includes('Ignore me'));
});

test('if template file has no matching heading, entire file is used', async t => {
  const folderTemplate = `# SomeHeading
Some content
`;

  const env = {
    smart_sources: create_smart_sources([
      {
        path: 'folder/subfolder/folder_template.md',
        async read() { return folderTemplate; }
      }
    ]),
    smart_templates: {
      settings: {
        template_name: 'folder_template',
        merge_parent_templates: false,
        template_heading: 'ActualTemplate'  // Not found
      }
    }
  };

  const source_item = make_source_item(
    'folder/subfolder/file.md',
    env,
    '# FileHeading\nFile content'
  );
  const result = await get_dynamic_template(source_item);

  t.truthy(result);
  t.true(result.includes('# SomeHeading'));
  t.true(result.includes('Some content'));
});

test('merge_parent_templates=true merges each file, using only heading portion if it exists', async t => {
  const subfolderTemplate = `## MyHeading
Subfolder portion
extra lines
`;
  const parentTemplate = `# Something
Not relevant

## MyHeading
Parent portion
still parent portion
`;
  const rootTemplate = `# NoMatchingHeading
Root entire file used if no heading "MyHeading"?
`;

  const env = {
    smart_sources: create_smart_sources([
      {
        path: 'folder/subfolder/folder_template.md',
        async read() { return subfolderTemplate; }
      },
      {
        path: 'folder/folder_template.md',
        async read() { return parentTemplate; }
      },
      {
        path: 'folder_template.md',
        async read() { return rootTemplate; }
      }
    ]),
    smart_templates: {
      settings: {
        template_name: 'folder_template',
        merge_parent_templates: true,
        template_heading: 'MyHeading'
      }
    }
  };

  const source_item = make_source_item(
    'folder/subfolder/file.md',
    env,
    '# Irrelevant\nFile content not used here'
  );

  /*
    Merge order: subfolder => folder => root
    subfolder -> has "## MyHeading" => "Subfolder portion..."
    folder -> has "## MyHeading" => "Parent portion..."
    root -> does NOT have "## MyHeading" => entire file used
  */
  const result = await get_dynamic_template(source_item);
  t.truthy(result);

  t.true(result.indexOf('Subfolder portion') < result.indexOf('Parent portion'));
  t.true(result.includes('Root entire file used if no heading "MyHeading"?'));
});

test('template_heading in current note is appended last if found and merge_parent_templates=true', async t => {
  const folderTemplate = `## MyHeading
Folder-level portion
`;

  const env = {
    smart_sources: create_smart_sources([
      {
        path: 'folder/subfolder/folder_template.md',
        async read() { return folderTemplate; }
      }
    ]),
    smart_templates: {
      settings: {
        template_name: 'folder_template',
        merge_parent_templates: true,
        template_heading: 'MyHeading'
      }
    }
  };

  const source_item = {
    path: 'folder/subfolder/file.md',
    env,
    async read() {
      return `# Intro

## MyHeading
Current note portion line 1
Current note portion line 2
`;
    }
  };

  const result = await get_dynamic_template(source_item);
  t.truthy(result);

  t.true(result.includes('Folder-level portion'));
  t.true(result.includes('Current note portion line 1'));

  const folderIndex = result.indexOf('Folder-level portion');
  const noteIndex = result.indexOf('Current note portion line 1');
  t.true(folderIndex < noteIndex);
});

/**
 * New test that verifies if 'system_prompt_heading' is set, the heading and
 * its sub-block are removed from the final content.
 */
test('removes system_prompt_heading block from final content if system_prompt_heading is set', async t => {
  const fileContent = `# Intro

## SystemPrompt
This should be removed
It might include multiple lines

## MainContent
Keep this around
`;

  const env = {
    smart_sources: create_smart_sources([]),
    smart_templates: {
      settings: {
        system_prompt_heading: 'SystemPrompt',
        merge_parent_templates: false,
        template_name: 'some_template'
      }
    }
  };

  const source_item = make_source_item(
    'folder/subfolder/file.md',
    env,
    fileContent
  );

  // No actual template file needed, so fallback -> returns the file content
  // Then 'system_prompt_heading' is removed from final output
  const result = await get_dynamic_template(source_item);
  t.truthy(result);

  // Confirm the entire "## SystemPrompt" section is gone
  t.false(result.includes('This should be removed'));
  t.true(result.includes('## MainContent'));
  t.true(result.includes('Keep this around'));
});
