import { SmartTemplatesAdapter } from './_adapter.js';
import { has_template_base_config } from '../../utils/template_base.js';
import {
  build_template_matcher,
  filter_blocks_by_headings,
  parse_template_headings,
  resolve_template_folders,
} from '../../utils/template_discovery.js';

/** Existing folder/name/frontmatter/heading discovery, prepared on demand. */
export class LegacySmartTemplatesAdapter extends SmartTemplatesAdapter {
  get key() { return 'legacy'; }
  get reconcile_mode() { return 'authoritative'; }

  get default_folder() {
    const app = this.env.plugin?.app || this.env.main?.app;
    return app?.internalPlugins?.plugins?.templates?.instance?.options?.folder || '';
  }

  get_snapshot(params = {}) {
    const settings = this.collection.settings;
    const settings_signature = JSON.stringify([
      settings.template_folder, settings.template_name, settings.template_headings, this.default_folder,
      settings.template_base, settings.template_base_scopes,
    ]);
    if (this.settings_signature !== settings_signature) {
      super.invalidate({ reason: 'settings' });
      this.settings_signature = settings_signature;
    }
    return super.get_snapshot(params);
  }

  get_template_matcher(params = {}) {
    const settings = this.collection.settings;
    return build_template_matcher({
      template_folders: resolve_template_folders(settings, this.default_folder),
      template_name: settings.template_name || '',
      template_headings: params.template_headings || parse_template_headings(settings),
    });
  }

  async prepare(params = {}) {
    const candidate = this.create_candidate(params);
    const sources = this.env.smart_sources;
    const headings = parse_template_headings(this.collection.settings);
    if (this.env.collections?.smart_sources !== 'loaded' || !sources) {
      throw new Error('Template discovery is waiting for Smart Sources.');
    }
    if (headings.length && this.env.collections?.smart_blocks !== 'loaded') {
      throw new Error('Template heading discovery is waiting for Smart Blocks.');
    }
    // Observe the existing import lifecycle; never start or modify an import here.
    if (sources._run_re_import_promise || Object.keys(sources.sources_re_import_queue || {}).length) {
      throw new Error('Template discovery is waiting for queued source updates.');
    }
    const source_items = Object.values(sources.items);
    const matcher = this.get_template_matcher({ template_headings: headings });
    const template_sources = source_items.filter((source) => !source.deleted && matcher(source));
    const template_blocks = headings.length ? filter_blocks_by_headings(
      Object.values(this.env.smart_blocks?.items || {}).filter((block) => {
        const source = sources.get(block.key.split('#')[0]);
        return !block.deleted && source && !source.deleted;
      }),
      headings,
    ) : [];
    const seen = new Set();
    for (const source of [...template_sources, ...template_blocks]) {
      if (seen.has(source.key)) continue;
      seen.add(source.key);
      candidate.records.push({
        key: source.key,
        data: { source_key: source.key, content: null, built_in: false },
      });
      candidate.visible_keys.push(source.key);
    }
    return candidate;
  }

  owns_item(item) {
    return !has_template_base_config(this.collection.settings) && !item.data.built_in && item.data.transient !== true && Boolean(item.data.source_key);
  }

  invalidate(event = {}) {
    if (event.collection_key && event.collection_key !== 'smart_sources' && event.collection_key !== 'smart_templates') return;
    super.invalidate(event);
  }
}
