import test from 'ava';
import { should_reload_templates } from './should_reload_templates.js';

test('returns false when matcher is unavailable', t => {
	const smart_templates = {
		get_template_matcher: () => null,
	};
	const result = should_reload_templates(smart_templates, {
		smart_sources: {get: () => null},
		payload: {path: 'Templates/Example.md'},
	});
	t.false(result);
});

test('returns true when smart_sources item matches', t => {
	const smart_templates = {
		get_template_matcher: () => (source_item) => source_item?.key?.endsWith('Template.md'),
	};
	const smart_sources = {
		get: (key) => ({key}),
	};
	const result = should_reload_templates(smart_templates, {
		smart_sources,
		payload: {path: 'Templates/ExampleTemplate.md'},
	});
	t.true(result);
});

test('returns true when deleted path matches via fallback', t => {
	const smart_templates = {
		get_template_matcher: () => (source_item) => source_item?.key?.includes('/Templates/'),
	};
	const smart_sources = {
		get: () => null,
	};
	const result = should_reload_templates(smart_templates, {
		smart_sources,
		payload: {path: 'Notes/Templates/Old.md'},
	});
	t.true(result);
});

test('returns true when renamed old_path matches', t => {
	const smart_templates = {
		get_template_matcher: () => (source_item) => source_item?.key?.includes('Templates/'),
	};
	const smart_sources = {
		get: () => null,
	};
	const result = should_reload_templates(smart_templates, {
		smart_sources,
		payload: {old_path: 'Templates/Legacy.md'},
	});
	t.true(result);
});

test('returns false when no path data is provided', t => {
	const smart_templates = {
		get_template_matcher: () => () => false,
	};
	const result = should_reload_templates(smart_templates, {
		smart_sources: {get: () => null},
		payload: {},
	});
	t.false(result);
});

test('returns false for partial folder-prefix matches that do not actually match template folders', t => {
	const smart_templates = {
		get_template_matcher: () => (source_item) => {
			const key = source_item?.key || '';
			return key === 'Templates' || key.startsWith('Templates/');
		},
	};
	const smart_sources = {
		get: (key) => ({key}),
	};
	const result = should_reload_templates(smart_templates, {
		smart_sources,
		payload: {path: 'Templates-Archive/Legacy.md'},
	});
	t.false(result);
});
