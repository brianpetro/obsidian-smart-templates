import { fnv1a_32_alphanumeric } from 'smart-utils/create_hash.js';

/** Public semantic options; presentation/refresh params are not inference inputs. */
export const HEADING_INFERENCE_DEFAULTS = Object.freeze({
  min_support: 2,
  min_heading_count: 2,
  max_templates: 20,
  min_heading_confidence: 0.75,
  exclude_document_title: true,
  base_heading_level: 2,
  include_source_keys: false,
});

/** Validate before any corpus work. An explicit empty whitelist stays empty. */
export function normalize_heading_inference_params(params = {}) {
  const result = {};
  for (const [key, fallback] of Object.entries(HEADING_INFERENCE_DEFAULTS)) {
    result[key] = params[key] === undefined ? fallback : params[key];
  }
  for (const key of ['min_support', 'min_heading_count', 'max_templates', 'base_heading_level']) {
    if (!Number.isInteger(result[key]) || result[key] < 1) throw new TypeError(`${key} must be a positive integer.`);
  }
  if (result.base_heading_level > 6) throw new RangeError('base_heading_level must be between 1 and 6.');
  if (!Number.isFinite(result.min_heading_confidence) || result.min_heading_confidence < 0 || result.min_heading_confidence > 1) {
    throw new RangeError('min_heading_confidence must be between 0 and 1.');
  }
  for (const key of ['exclude_document_title', 'include_source_keys']) {
    if (typeof result[key] !== 'boolean') throw new TypeError(`${key} must be a Boolean.`);
  }
  if (params.source_keys !== undefined) {
    if (!Array.isArray(params.source_keys) || params.source_keys.some((key) => typeof key !== 'string' || !key.trim())) {
      throw new TypeError('source_keys must be an array of exact nonblank source keys.');
    }
    result.source_keys = [...new Set(params.source_keys)].sort(compare_code_points);
  }
  return result;
}

/** Locale-independent Unicode code-point order, including supplementary text. */
export function compare_code_points(left, right) {
  let left_index = 0;
  let right_index = 0;
  while (left_index < left.length && right_index < right.length) {
    const left_point = left.codePointAt(left_index);
    const right_point = right.codePointAt(right_index);
    if (left_point !== right_point) return left_point - right_point;
    left_index += left_point > 0xffff ? 2 : 1;
    right_index += right_point > 0xffff ? 2 : 1;
  }
  return (left_index < left.length ? 1 : 0) - (right_index < right.length ? 1 : 0);
}

export function normalize_heading_title(title) {
  return title.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

/**
 * Pure exact-sequence aggregation of verified source skeletons. Neither the
 * supplied headings nor their parent relationships are changed. hash_signature
 * is a helper-only test seam, not an action operand or configurable strategy.
 *
 * @param {Array<{source_key: string, headings: object[], issues: object[]}>} sources
 * @param {object} [params={}]
 * @param {(signature: string) => string} [hash_signature]
 * @returns {{templates: object[], inspected_source_count: number, eligible_source_count: number, issues: object[]}}
 */
export function infer_heading_templates(sources, params = {}, hash_signature = fnv1a_32_alphanumeric) {
  const opts = normalize_heading_inference_params(params);
  const clusters = new Map();
  const seen_sources = new Set();
  const issues = [];
  let eligible_source_count = 0;
  const whitelist = opts.source_keys && new Set(opts.source_keys);
  const observations = sources.filter((source) => !whitelist || whitelist.has(source.source_key))
    .slice().sort((left, right) => compare_code_points(left.source_key, right.source_key));

  for (const source of observations) {
    const { source_key } = source;
    if (seen_sources.has(source_key)) throw new Error(`Duplicate inference source: ${source_key}`);
    seen_sources.add(source_key);
    if (source.issues.length) {
      issues.push(...source.issues);
      continue;
    }
    const all_headings = new Map(source.headings.map((heading) => [heading.block_key, heading]));
    let headings = source.headings.filter((heading) => heading.confidence >= opts.min_heading_confidence)
      .slice().sort((left, right) => left.line_start - right.line_start || right.line_end - left.line_end
        || compare_code_points(left.block_key, right.block_key));
    const first = headings[0];
    const basename = source_key.split('/').pop().replace(/\.(md|txt)$/i, '');
    if (opts.exclude_document_title && first?.level === 1 && first.parent_key === null
      && (normalize_heading_title(first.title) === normalize_heading_title(basename)
        || headings.slice(1).every((heading) => has_ancestor(heading, first.block_key, all_headings)))) {
      headings = headings.slice(1);
    }
    if (headings.length < opts.min_heading_count) continue;

    const retained = new Set(headings.map((heading) => heading.block_key));
    const depths = new Map();
    const sequence = headings.map((heading) => {
      let parent_key = heading.parent_key;
      while (parent_key && !retained.has(parent_key)) parent_key = all_headings.get(parent_key)?.parent_key ?? null;
      const depth = parent_key ? depths.get(parent_key) + 1 : 0;
      if (!Number.isInteger(depth)) throw new Error(`Invalid heading ancestry: ${source_key}`);
      depths.set(heading.block_key, depth);
      return { depth, title: heading.title, title_key: normalize_heading_title(heading.title) };
    });
    if (sequence.some((heading) => heading.depth > 5)) {
      issues.push({ source_key, code: 'heading_depth_unsupported', message: 'Heading hierarchy exceeds six Markdown levels.' });
      continue;
    }
    eligible_source_count += 1;
    const signature = JSON.stringify(sequence.map(({ depth, title_key }) => [depth, title_key]));
    if (!clusters.has(signature)) clusters.set(signature, []);
    clusters.get(signature).push({ source_key, sequence });
  }

  const templates = [];
  const signatures_by_key = new Map();
  for (const [signature, members] of clusters) {
    if (members.length < opts.min_support) continue;
    const headings = members[0].sequence.map(({ depth, title_key }, index) => {
      const spellings = new Map();
      for (const member of members) {
        const title = member.sequence[index].title;
        if (!spellings.has(title)) spellings.set(title, { title, count: 0, source_key: member.source_key });
        spellings.get(title).count += 1;
      }
      const spelling = [...spellings.values()].sort((left, right) => right.count - left.count
        || compare_code_points(left.source_key, right.source_key) || compare_code_points(left.title, right.title))[0];
      return { depth, title: spelling.title, title_key };
    });
    const max_depth = headings.reduce((max, { depth }) => Math.max(max, depth), 0);
    const root_level = Math.max(1, Math.min(opts.base_heading_level, 6 - max_depth));
    const key = `derived_headings:${hash_signature(signature)}`;
    if (signatures_by_key.has(key) && signatures_by_key.get(key) !== signature) {
      throw new Error(`Template signature collision: ${key}`);
    }
    signatures_by_key.set(key, signature);
    templates.push({
      key, signature, headings,
      content: headings.map(({ depth, title }) => `${'#'.repeat(root_level + depth)} ${title}`).join('\n\n') + '\n',
      heading_count: headings.length,
      support: members.length,
      coverage: members.length / eligible_source_count,
      ...(opts.include_source_keys ? { source_keys: members.map(({ source_key }) => source_key) } : {}),
    });
  }
  templates.sort((left, right) => right.support - left.support || right.heading_count - left.heading_count
    || compare_code_points(left.signature, right.signature));
  return {
    templates: templates.slice(0, opts.max_templates),
    inspected_source_count: seen_sources.size,
    eligible_source_count,
    issues,
  };
}

function has_ancestor(heading, ancestor_key, headings) {
  let parent_key = heading.parent_key;
  while (parent_key) {
    if (parent_key === ancestor_key) return true;
    parent_key = headings.get(parent_key)?.parent_key;
  }
  return false;
}
