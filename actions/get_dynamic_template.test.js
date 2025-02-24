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
      // If 'arg' is a function, run a typical filter.
      if (typeof arg === 'function') {
        return this.items.filter(arg);
      }
      // If 'arg' is an object with 'key_starts_with' and 'key_ends_with'
      // then filter for items whose path starts/ends with the given strings.
      const { key_starts_with, key_ends_with } = arg;
      return this.items.filter(i => {
        const startsMatch = key_starts_with ? i.path.startsWith(key_starts_with) : true;
        const endsMatch = key_ends_with ? i.path.endsWith(key_ends_with) : true;
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
        template_name: 'folder_template', // will check for 'folder_template.md'
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
        template_name: 'folder_template', // ends up as 'folder_template.md'
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
  // This test ensures that if multiple items match,
  // the function sorts them by descending path length
  // and returns the first (longest path match).
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

  // Since merge=false, it should return the item
  // with the longest path match (i.e. 'folder/subfolder/deeper/folder_template.md')
  const result = await get_dynamic_template(source_item);
  t.is(result, 'Deeper folder template');
});

test('merges content from child folder up to root when merge=true', async t => {
  // We define three templates along the path, which will be merged in ascending order
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
    Merge order with merge_parent_templates=true:
    - Start folder: 'folder/subfolder'
    - Next folder: 'folder'
    - Next folder: ''
    The content will be concatenated with blank lines in between,
    but child folder content is appended first.
  */
  const result = await get_dynamic_template(source_item);
  t.is(
    result,
    [
      'Subfolder template',
      '',
      'Folder-level template',
      '',
      'Root-level template'
    ].join('\n\n')
  );
});
