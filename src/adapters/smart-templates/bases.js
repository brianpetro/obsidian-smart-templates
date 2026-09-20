import { SmartTemplatesAdapter } from './_adapter.js';
import {
  extract_template_base_paths,
  get_template_event_paths,
  is_vault_path,
  parse_template_base_config,
  resolve_template_base,
} from '../../utils/template_base.js';
import { filter_blocks_by_headings, parse_template_headings } from '../../utils/template_discovery.js';

/** Scope membership only. Base parsing/evaluation remains the source/view's job. */
export class BasesSmartTemplatesAdapter extends SmartTemplatesAdapter {
  constructor(collection) {
    super(collection);
    this.definition_revisions = new Map();
    this.imported_revisions = new Map();
    this.base_imports = new Map();
  }

  get key() { return 'bases'; }
  get reconcile_mode() { return 'ensure'; }

  sync_config() {
    const settings = this.collection.settings;
    const signature = JSON.stringify([
      settings.template_base, settings.template_base_view,
      settings.template_base_scopes, settings.template_headings,
    ]);
    if (signature === this.settings_signature) return;
    super.invalidate({ reason: 'settings' });
    this.settings_signature = signature;
    this.config_error = null;
    try {
      this.base_config = parse_template_base_config(settings);
    } catch (error) {
      this.base_config = null;
      this.config_error = error;
    }
  }

  get_scope_key(params = {}) {
    this.sync_config();
    const scope_source_key = params.scope_source_key ?? null;
    if (this.config_error) return JSON.stringify(['invalid', this.settings_signature, scope_source_key]);
    const mapping = resolve_template_base(this.base_config, scope_source_key);
    return JSON.stringify([mapping?.base_key || null, mapping?.view_name || null, scope_source_key]);
  }

  /** Returns metadata only; no reads, imports, or workspace lookup. */
  get_mapping(params = {}) {
    this.sync_config();
    if (this.config_error) throw this.config_error;
    return resolve_template_base(this.base_config, params.scope_source_key);
  }

  get_view_blocks(source) {
    return (source.blocks || [])
      .filter((block) => block && !block.deleted && typeof block.data?.view_name === 'string')
      .sort((left, right) => left.lines[0] - right.lines[0]);
  }

  /** Initialize only through the existing eligible-source lifecycle. */
  require_source(key) {
    const sources = this.env.smart_sources;
    if (sources.fs?.is_excluded(key)) throw new Error(`Template source is excluded: ${key}`);
    const app = this.env.obsidian_app || this.env.plugin?.app || this.env.main?.app;
    if (app?.vault?.getAbstractFileByPath && !app.vault.getAbstractFileByPath(key)) {
      throw new Error(`Template source is missing: ${key}`);
    }
    const source = sources.get(key) || sources.init_file_path?.(key);
    if (!source || source.deleted || source.key !== key) throw new Error(`Template source is unavailable: ${key}`);
    return source;
  }

  /** Coalesce definition imports across different contextual scopes. */
  async ensure_views(source) {
    const key = source.key;
    const revision = this.definition_revisions.get(key) || 0;
    const views = this.get_view_blocks(source);
    const stat = source.file?.stat;
    const last_import = source.data?.last_import;
    const changed = stat && (last_import?.mtime !== stat.mtime || last_import?.size !== stat.size);
    const dirty = revision !== (this.imported_revisions.get(key) || 0);
    if (!views.length || dirty || changed || source._queue_import) {
      if (!this.base_imports.has(key)) {
        const pending = (async () => {
          if (typeof source.import !== 'function') throw new Error(`Base view import is unavailable: ${key}`);
          const previous_import = source.data?.last_import;
          await source.import({ refresh: true });
          if (this.unloaded) throw new Error('Templates was unloaded during Base import.');
          // SmartSource.import() may catch errors and requeue. Do not accept that
          // as successful definition refresh or continue with old view metadata.
          const imported = source.data?.last_import;
          const current_stat = source.file?.stat;
          if (source.deleted || source._queue_import
            || (previous_import && imported === previous_import)
            || (current_stat && (imported?.mtime !== current_stat.mtime || imported?.size !== current_stat.size))) {
            throw new Error(`Base definition refresh did not complete: ${key}`);
          }
          if ((this.definition_revisions.get(key) || 0) === revision) this.imported_revisions.set(key, revision);
        })();
        this.base_imports.set(key, pending);
      }
      const pending = this.base_imports.get(key);
      try { await pending; }
      finally { if (this.base_imports.get(key) === pending) this.base_imports.delete(key); }
    }
    const resolved = this.get_view_blocks(source);
    if (!resolved.length) throw new Error(`No indexed Base views are available: ${key}`);
    return resolved;
  }

  async prepare(params = {}) {
    const candidate = this.create_candidate(params);
    const mapping = this.get_mapping(params);
    candidate.scope_source_key = params.scope_source_key ?? null;
    candidate.base_key = mapping?.base_key || null;
    candidate.view_name = mapping?.view_name || null;
    if (!mapping || !candidate.scope_source_key) {
      candidate.issues.push({ message: mapping
        ? 'A source file is required for Base-backed template discovery. Showing built-in and confirmed inline templates.'
        : 'No template Base applies to this scope. Showing built-in and confirmed inline templates.' });
      return candidate;
    }
    if (!is_vault_path(candidate.scope_source_key)) throw new Error('Template scope must be an exact vault source path.');
    if (this.env.collections?.smart_sources !== 'loaded' || this.env.collections?.smart_blocks !== 'loaded') {
      throw new Error('Template Base discovery is waiting for Smart Sources and Smart Blocks.');
    }
    const source = this.require_source(mapping.base_key);
    const views = await this.ensure_views(source);
    if (!this.is_current(candidate)) return candidate;
    const view = mapping.view_name ? views.find((block) => block.data.view_name === mapping.view_name) : views[0];
    if (!view) throw new Error(`Template Base view not found: ${mapping.view_name}`);
    candidate.view_name = view.data.view_name;
    const result = await view.read({ this_file: candidate.scope_source_key });
    if (!this.is_current(candidate)) return candidate;
    const rows = typeof result === 'string' ? JSON.parse(result) : result;
    const { keys, unusable_rows } = extract_template_base_paths(rows);
    const headings = parse_template_headings(this.collection.settings);
    let unavailable_rows = 0;
    const record_keys = new Set();
    for (const key of keys) {
      if (!this.is_current(candidate)) return candidate;
      let member;
      try {
        member = this.require_source(key);
        // File templates need no content import here. Heading templates require
        // existing indexed blocks; initialize missing indexes via their owner.
        if (headings.length && (!member.data?.blocks || member._queue_import)) {
          if (typeof member.import !== 'function') throw new Error(`Heading import is unavailable: ${key}`);
          await member.import();
          if (member._queue_import || member.deleted || !member.data?.blocks) throw new Error(`Heading import is pending: ${key}`);
        }
      } catch {
        unavailable_rows += 1;
        continue;
      }
      const selected = [member, ...filter_blocks_by_headings(
        (member.blocks || []).filter((block) => block && !block.deleted), headings,
      )];
      for (const item of selected) {
        if (record_keys.has(item.key)) continue;
        record_keys.add(item.key);
        candidate.records.push({ key: item.key, data: { source_key: item.key, content: null, built_in: false } });
        candidate.visible_keys.push(item.key);
      }
    }
    if (unusable_rows || unavailable_rows) {
      candidate.issues.push({ message: `Template Base skipped ${unusable_rows} rows without a full Markdown/text path and ${unavailable_rows} unavailable or excluded sources.` });
    }
    return candidate;
  }

  /** Relevant path checks only; query-created nonconfigured .base files are irrelevant. */
  invalidate(event = {}) {
    if (event.collection_key && !['smart_sources', 'smart_templates'].includes(event.collection_key)) return;
    this.sync_config();
    const reason = event.reason || '';
    const paths = get_template_event_paths(event);
    const global = !reason || ['manual_refresh', 'forced_refresh', 'settings', 'catalog_loaded'].includes(reason);
    // The source watcher carries paths, not file/folder types. Conservatively
    // invalidate membership on non-Base topology (including dotted folders).
    // Temporary nonconfigured .base files still cannot self-invalidate a query.
    const candidate_event = /(?:created|deleted|renamed)$/.test(reason)
      && paths.some((path) => !/\.base$/i.test(path));
    const definition_event = /(?:created|modified|deleted|renamed)$/.test(reason);
    const configured = new Set(this.base_config
      ? [this.base_config.base_key, ...this.base_config.scopes.map((scope) => scope.base_key)].filter(Boolean)
      : []);
    const changed_definitions = new Set();
    for (const base_key of configured) {
      if (definition_event && paths.some((path) => path === base_key
        || (/(?:created|deleted|renamed)$/.test(reason) && base_key.startsWith(`${path}/`)))) {
        changed_definitions.add(base_key);
        this.definition_revisions.set(base_key, (this.definition_revisions.get(base_key) || 0) + 1);
      }
    }
    for (const snapshot of this.snapshots.values()) {
      const [base_key] = JSON.parse(snapshot.scope_key);
      if (!global && !candidate_event && !changed_definitions.has(base_key)) continue;
      snapshot.invalidation_revision += 1;
      if (snapshot.revision) snapshot.status = 'stale';
    }
  }

  unload() {
    super.unload();
    this.base_imports.clear();
    this.definition_revisions.clear();
    this.imported_revisions.clear();
  }
}
