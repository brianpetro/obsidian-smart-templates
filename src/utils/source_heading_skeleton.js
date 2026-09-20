import { parse_markdown_blocks } from 'smart-blocks/parsers/markdown.js';
import { compare_code_points } from './infer_heading_templates.js';

/**
 * Verify a COMPLETE indexed source block map against one existing source.read()
 * result. The unchanged pure parser supplies key/range validation, never import
 * or index repair. A bounded ATX-line pass detects lost duplicate occurrences
 * and recovers authored titles rather than decoding synthetic key suffixes.
 *
 * Supported evidence is the current parser's ATX/frontmatter/triple-backtick
 * representation. Ambiguous fences/indented headings are reported, not guessed.
 * Confidence 1 means verified structural evidence, not a probability estimate.
 *
 * @param {{source_key: string, blocks: Array<{key: string, lines: number[]}>, content: string}} params
 * @returns {{headings: object[], issues: object[]}}
 */
export function source_heading_skeleton({ source_key, blocks, content }) {
  const reject = (code, message, block_key) => ({
    headings: [],
    issues: [{ source_key, code, message, ...(block_key ? { block_key } : {}) }],
  });
  if (typeof content !== 'string' || !content.length) {
    return reject('source_content_unavailable', 'The existing source read returned no verifiable content.');
  }
  const lines = content.split('\n');
  const indexed = new Map();
  for (const block of blocks) {
    if (typeof block.key !== 'string' || !block.key.startsWith(`${source_key}#`) || indexed.has(block.key)) {
      return reject('block_identity_ambiguous', 'Invalid or duplicate indexed block identity.', block.key);
    }
    const range = block.lines;
    if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isInteger)
      || range[0] < 1 || range[1] < range[0] || range[1] > lines.length) {
      return reject('block_range_invalid', 'A complete source requires valid inclusive block ranges.', block.key);
    }
    indexed.set(block.key, range);
  }
  // One pure parse per examined source, using the same default representation
  // as import. Do not copy that parser or invoke its mutating content wrapper.
  let parsed;
  try {
    parsed = parse_markdown_blocks(content).blocks;
  } catch (error) {
    return reject('source_parse_failed', error.message || String(error));
  }
  const parsed_entries = Object.entries(parsed);
  if (indexed.size !== parsed_entries.length) {
    return reject('source_index_mismatch', 'Current text and the complete indexed block map differ.');
  }
  const by_start = new Map();
  for (const [sub_key, range] of parsed_entries) {
    const key = source_key + sub_key;
    const observed = indexed.get(key);
    if (!observed || observed[0] !== range[0] || observed[1] !== range[1]) {
      return reject('source_index_mismatch', 'Current text and indexed block identity/ranges differ.', key);
    }
    if (!by_start.has(range[0])) by_start.set(range[0], []);
    by_start.get(range[0]).push({ key, lines: range });
  }

  const headings = [];
  const parents = [];
  let in_frontmatter = false;
  let in_code = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (index === 0 && trimmed === '---') { in_frontmatter = true; continue; }
    if (in_frontmatter) {
      if (trimmed === '---') in_frontmatter = false;
      continue;
    }
    if (trimmed.startsWith('```')) {
      if (trimmed.startsWith('````') || (in_code && !/^```\s*$/.test(trimmed))) {
        return reject('heading_syntax_unsupported', 'Ambiguous backtick fence; source excluded from ATX inference.');
      }
      in_code = !in_code;
      continue;
    }
    if (in_code) continue;
    if (/^~{3,}/.test(trimmed) || trimmed.startsWith('<!--')) {
      return reject('heading_syntax_unsupported', 'This source needs Markdown syntax beyond the bounded ATX verifier.');
    }
    const match = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (!match) continue;
    if (/^(?: {4}|\t)/.test(line)) {
      return reject('heading_syntax_unsupported', 'Indented heading-like content is not accepted as an authored ATX heading.');
    }
    const matches = by_start.get(index + 1) || [];
    if (matches.length !== 1) {
      return reject('heading_occurrence_ambiguous', 'An authored heading occurrence has no unique indexed block.');
    }
    const block = matches[0];
    const level = match[1].length;
    while (parents.length && parents[parents.length - 1].level >= level) parents.pop();
    const parent = parents[parents.length - 1];
    if (parent && (block.lines[1] > parent.line_end || !block.key.startsWith(`${parent.block_key}#`))) {
      return reject('heading_ancestry_invalid', 'The heading parent is inconsistent with indexed identity/ranges.', block.key);
    }
    const heading = {
      block_key: block.key,
      title: match[2].trim(), level,
      parent_key: parent?.block_key ?? null,
      line_start: block.lines[0], line_end: block.lines[1], confidence: 1,
    };
    headings.push(heading);
    parents.push(heading);
  }
  if (in_frontmatter || in_code) return reject('heading_syntax_unsupported', 'An unclosed frontmatter/code fence prevents complete heading verification.');
  headings.sort((left, right) => left.line_start - right.line_start || right.line_end - left.line_end
    || compare_code_points(left.block_key, right.block_key));
  return { headings, issues: [] };
}
