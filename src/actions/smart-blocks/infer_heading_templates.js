import { source_heading_skeleton } from '../../utils/source_heading_skeleton.js';
import {
  compare_code_points, infer_heading_templates, normalize_heading_inference_params,
} from '../../utils/infer_heading_templates.js';

/**
 * Explicit read-only inference over sources represented in this exact SmartBlocks
 * collection. Read each selected source once, sequentially, using existing read()
 * behavior (including its ordinary bookkeeping). Never import or repair indexes.
 * Results are per-source observations, not an atomic whole-vault snapshot.
 *
 * @this {import('smart-blocks').SmartBlocks}
 * @param {object} [params={}] Exact whitelist and documented inference controls.
 * @returns {Promise<{templates: object[], inspected_source_count: number, eligible_source_count: number, issues: object[]}>}
 */
export async function smart_blocks_infer_heading_templates(params = {}) {
  const opts = normalize_heading_inference_params(params);
  const sources = this.env?.smart_sources;
  if (!this.items || !sources?.get) throw new Error('Heading inference requires SmartBlocks and SmartSources.');
  const whitelist = opts.source_keys && new Set(opts.source_keys);
  const groups = new Map();
  const orphan_issues = [];
  for (const [entry_key, block] of Object.entries(this.items)) {
    if (!block || block.deleted) continue;
    const source_key = block.source_key;
    if (typeof source_key !== 'string' || !source_key) {
      if (!whitelist) orphan_issues.push({ block_key: entry_key, code: 'block_source_missing', message: 'Indexed block has no canonical source key.' });
      continue;
    }
    if (whitelist && !whitelist.has(source_key)) continue;
    if (!groups.has(source_key)) groups.set(source_key, { source_key, blocks: [], issues: [] });
    const group = groups.get(source_key);
    if (entry_key !== block.key) group.issues.push({ source_key, block_key: entry_key, code: 'block_identity_ambiguous', message: 'Indexed block key differs from its collection identity.' });
    group.blocks.push({ key: block.key, lines: Array.isArray(block.lines) ? [...block.lines] : block.lines });
  }

  const observations = [];
  for (const group of [...groups.values()].sort((left, right) => compare_code_points(left.source_key, right.source_key))) {
    if (this.unloaded) throw new Error('SmartBlocks unloaded during heading inference.');
    const { source_key } = group;
    let skeleton = { headings: [], issues: group.issues };
    if (!group.issues.length) {
      const source = sources.get(source_key);
      if (!source || source.deleted || typeof source.read !== 'function') {
        skeleton.issues = [{ source_key, code: 'source_unavailable', message: 'The represented source or its read capability is unavailable.' }];
      } else if (!/\.(md|txt)$/i.test(source_key)) {
        skeleton.issues = [{ source_key, code: 'source_type_unsupported', message: 'This file type is not used for Markdown/text heading inference.' }];
      } else {
        try {
          const content = await source.read();
          if (sources.get(source_key) !== source || source.deleted) throw new Error('Source identity changed during inference.');
          skeleton = source_heading_skeleton({ ...group, content });
        } catch (error) {
          skeleton.issues = [{ source_key, code: 'source_read_failed', message: error.message || String(error) }];
        }
      }
    }
    observations.push({ source_key, ...skeleton });
  }
  if (this.unloaded) throw new Error('SmartBlocks unloaded during heading inference.');
  const result = infer_heading_templates(observations, opts);
  result.issues.push(...orphan_issues.sort((left, right) => compare_code_points(left.block_key, right.block_key)));
  return result;
}

export const display_name = 'Infer heading templates';
export const display_description = 'Derives exact recurring heading sequences from indexed sources on explicit invocation.';
export const action_scope = { type: 'collection', collection_key: 'smart_blocks' };
