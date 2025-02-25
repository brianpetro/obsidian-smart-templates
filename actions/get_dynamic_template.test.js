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

  // Should return 'folder/subfolder/deeper/folder_template.md' since that's the longest path
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
    Merge order with merge_parent_templates=true (child → parent → root):
      1) folder/subfolder/folder_template.md
      2) folder/folder_template.md
      3) folder_template.md

    The final output should show subfolder text, then folder text, then root text.
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
