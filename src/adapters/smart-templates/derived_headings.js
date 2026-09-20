import { SmartTemplatesAdapter } from './_adapter.js';
import { get_template_event_paths } from '../../utils/template_base.js';
import { normalize_heading_inference_params } from '../../utils/infer_heading_templates.js';

/** Explicit-only candidate discovery. No reads or inference in invalidation. */
export class DerivedHeadingsSmartTemplatesAdapter extends SmartTemplatesAdapter {
  get key() { return 'derived_headings'; }
  get reconcile_mode() { return 'authoritative'; }

  constructor(collection) {
    super(collection);
    this.inference_params = normalize_heading_inference_params();
  }

  /** Change corpus options only at invocation start, never during snapshot reads. */
  configure(params = {}) {
    // These are invocation options, not user settings. Omission restores defaults.
    const next = normalize_heading_inference_params(params);
    if (JSON.stringify(next) !== JSON.stringify(this.inference_params)) {
      super.invalidate({ reason: 'inference_options' });
      this.inference_params = next;
    }
    return normalize_heading_inference_params(next);
  }

  async prepare(params = {}) {
    const inference_params = this.configure(params);
    const candidate = this.create_candidate(params);
    const blocks = this.env.smart_blocks;
    if (this.env.collections?.smart_blocks !== 'loaded' || this.env.collections?.smart_sources !== 'loaded') {
      throw new Error('Heading inference is waiting for Smart Sources and Smart Blocks.');
    }
    const sources = this.env.smart_sources;
    if (!sources || !blocks) throw new Error('Heading inference requires Smart Sources and Smart Blocks.');
    if (sources._run_re_import_promise || Object.keys(sources.sources_re_import_queue || {}).length) {
      throw new Error('Heading inference is waiting for queued source updates.');
    }
    const action = blocks?.actions?.smart_blocks_infer_heading_templates;
    if (typeof action !== 'function') throw new Error('The configured heading inference action is unavailable.');
    const result = await action(inference_params);
    if (!result || !Array.isArray(result.templates) || !Array.isArray(result.issues)
      || !Number.isInteger(result.inspected_source_count) || result.inspected_source_count < 0
      || !Number.isInteger(result.eligible_source_count) || result.eligible_source_count < 0
      || result.eligible_source_count > result.inspected_source_count) {
      throw new TypeError('Heading inference returned an invalid candidate result.');
    }
    for (const template of result.templates) {
      if (!template || typeof template.key !== 'string' || !template.key.startsWith('derived_headings:')
        || typeof template.signature !== 'string' || !template.signature
        || typeof template.content !== 'string' || !template.content.trim()
        || !Number.isInteger(template.heading_count) || template.heading_count < 1
        || !Number.isInteger(template.support) || template.support < 1 || template.support > result.eligible_source_count
        || template.coverage !== template.support / result.eligible_source_count) {
        throw new TypeError('Heading inference returned an invalid template.');
      }
      if (template.source_keys !== undefined && (!Array.isArray(template.source_keys)
        || template.source_keys.some((key) => typeof key !== 'string' || !key.trim()))) {
        throw new TypeError('Heading inference returned invalid supporting source keys.');
      }
      candidate.records.push({ key: template.key, data: {
        source_key: null, content: template.content, built_in: false,
        transient: true, provider_key: this.key, adapter_key: 'inline',
        provenance: {
          signature: template.signature, support: template.support,
          coverage: template.coverage, heading_count: template.heading_count,
          ...(template.source_keys ? { source_keys: [...template.source_keys] } : {}),
        },
      } });
      candidate.visible_keys.push(template.key);
    }
    candidate.issues = result.issues;
    candidate.inspected_source_count = result.inspected_source_count;
    candidate.eligible_source_count = result.eligible_source_count;
    return candidate;
  }

  owns_item(item) {
    return item.data.transient === true && item.data.provider_key === this.key;
  }

  /** Confirmation transfers ownership; a pending candidate is suppressed at commit. */
  detach_item(key) {
    const snapshot = this.get_snapshot();
    snapshot.records = snapshot.records.filter((record) => record.key !== key);
    snapshot.visible_keys = snapshot.visible_keys.filter((visible_key) => visible_key !== key);
  }

  invalidate(event = {}) {
    if (event.collection_key && event.collection_key !== 'smart_sources' && event.collection_key !== 'smart_templates') return;
    const paths = get_template_event_paths(event);
    if (event.reason?.startsWith('sources:') && paths.length
      && !paths.some((path) => /\.(md|txt)$/i.test(path) || (!/\.base$/i.test(path) && /renamed|deleted/.test(event.reason)))) return;
    super.invalidate(event);
  }
}
