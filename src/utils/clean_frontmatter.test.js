import test from 'ava';
import {clean_frontmatter} from './clean_frontmatter.js';

// Basic test: removes only specified keys
test('removes only specified keys from frontmatter', t => {
	const content = `---
title: Note
tags: []
author: 
date: 
content: Hello
---
Body text here.
`;
	const keysToRemove = ['tags', 'author', 'date'];
	const expected = `---
title: Note
content: Hello
---
Body text here.
`;
	t.is(clean_frontmatter(content, keysToRemove), expected);
});

// Test: trims whitespace from string fields only if key is specified
test('removes specified keys with whitespace', t => {
	const content = `---
title:   My Note  
description:    
category:   Work
---
Some note body.
`;
	const keysToRemove = ['description'];
	const expected = `---
title:   My Note  
category:   Work
---
Some note body.
`;
	t.is(clean_frontmatter(content, keysToRemove), expected);
});

// Test: removes fields with only whitespace if specified
test('removes only specified whitespace fields', t => {
	const content = `---
foo:   
bar: "\t"
baz: keep
---
Note body.
`;
	const keysToRemove = ['foo', 'bar'];
	const expected = `---
baz: keep
---
Note body.
`;
	t.is(clean_frontmatter(content, keysToRemove), expected);
});

// Test: keeps falsy but valid values unless specified
test('removes only specified falsy keys', t => {
	const content = `---
active: false
count: 0
name: 
---
Body.
`;
	const keysToRemove = ['name'];
	const expected = `---
active: false
count: 0
---
Body.
`;
	t.is(clean_frontmatter(content, keysToRemove), expected);
});

// Test: empty input
test('returns input unchanged for empty input', t => {
	t.is(clean_frontmatter('', ['foo', 'bar']), '');
});

test('should remove --- from empty frontmatter', t => {
  const content = `---\nfoo: bar\n---\ncontent`;
  t.is(clean_frontmatter(content, ['foo']), 'content');
});

// Test: non-string input returns empty string
test('handles non-string input gracefully', t => {
	t.is(clean_frontmatter(null, ['foo']), '');
	t.is(clean_frontmatter(undefined, ['foo']), '');
	t.is(clean_frontmatter(42, ['foo']), '');
	t.is(clean_frontmatter({}, ['foo']), '');
});
