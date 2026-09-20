/**
 * Smart Templates catalog. Discovery adapters produce snapshots; this collection
 * alone reconciles identity, preserves ownership, and schedules durable saves.
 */
import { Collection } from 'smart-collections';
import { deep_equal } from 'smart-collections/utils/deep_equal.js';
import { SmartTemplate } from '../items/smart_template.js';
import { default_templates } from '../defaults/default_templates.js';
import { TransientAjsonSingleFileCollectionDataAdapter } from '../adapters/data/transient_ajson_single_file.js';
import { LegacySmartTemplatesAdapter } from '../adapters/smart-templates/legacy.js';
import { BasesSmartTemplatesAdapter } from '../adapters/smart-templates/bases.js';
import { DerivedHeadingsSmartTemplatesAdapter } from '../adapters/smart-templates/derived_headings.js';
import { get_template_event_paths, has_template_base_config, parse_template_base_config } from '../utils/template_base.js';
import { parse_template_folders } from '../utils/template_discovery.js';

// Preserve supported imports while settings/modals move to the pure helper module.
export {
  parse_template_headings, stringify_template_headings,
  parse_template_folders, stringify_template_folders, resolve_template_folders,
  build_template_matcher, collect_template_folder_candidates,
  collect_block_heading_candidates, filter_blocks_by_headings,
} from '../utils/template_discovery.js';

/**
 * Resolve the active Obsidian app from the collection environment.
 *
 * @param {SmartTemplates} scope
 * @returns {import('obsidian').App | null}
 */
function get_scope_app(scope) {
  return scope?.env?.plugin?.app || scope?.env?.main?.app || globalThis.window?.app || null;
}

/**
 * Resolve a configured modal class by key.
 *
 * @param {SmartTemplates} scope
 * @param {string} modal_key
 * @returns {Function | null}
 */
function get_modal_class(scope, modal_key) {
  const ModalClass = scope?.env?.config?.modals?.[modal_key]?.class;
  return typeof ModalClass === 'function' ? ModalClass : null;
}

export class SmartTemplates extends Collection {
  static version = 2.0;

  constructor(env, opts = {}) {
    super(env, opts);
    // Collection-owned discovery adapters share identity, not scope membership.
    this.discovery_adapters = {
      legacy: new LegacySmartTemplatesAdapter(this),
      bases: new BasesSmartTemplatesAdapter(this),
      derived_headings: new DerivedHeadingsSmartTemplatesAdapter(this),
    };
    this._preparations = new Map();
    this._removed_source_paths = new Set();
  }

  get default_settings() {
    return {
      template_folder: '', template_name: '', template_headings: '',
      template_base: '', template_base_view: '', template_base_scopes: '',
    };
  }

  init() {
    this.load_default_templates();
    this.register_env_event_listeners();
  }

  async process_load_queue() {
    this._templates_loading = true;
    try {
      await super.process_load_queue();
      // Shipped defaults win over an old persisted copy, without changing keys.
      this.load_default_templates();
      this.invalidate_templates({ reason: 'catalog_loaded' });
    } finally {
      this._templates_loading = false;
    }
  }

  load_default_templates(processed_keys = new Set()) {
    for (const template of default_templates) {
      processed_keys.add(template.key);
      const existing = this.get(template.key);
      const pending_save = existing?._queue_save;
      const old_data = existing?.data;
      const item = this.create_or_update({
        key: template.key, source_key: null, content: template.content || '', built_in: true,
      });
      item.deleted = false;
      if (!existing || old_data !== item.data || pending_save) item.queue_save();
    }
  }

  /** Compatibility entry for existing discovery settings/callers. */
  load_templates() {
    return this.refresh_templates();
  }

  async refresh_templates(params = {}) {
    if (this.unloaded) return null;
    // Capture the explicit corpus before primary discovery yields. An older
    // refresh must not restore its options after a newer refresh has started.
    const derived = this.discovery_adapters.derived_headings;
    const inference_params = params.derive === true && this.active_discovery_adapter.key === 'legacy'
      ? derived.configure(params) : null;
    this.invalidate_templates({ reason: 'manual_refresh' });
    const derived_revision = derived.get_snapshot().invalidation_revision;
    const state = await this.prepare_templates({ ...params, force: false });
    // Only the explicit index action (or a deliberate programmatic refresh)
    // requests derivation. Opening/settings callbacks keep their cheap path.
    if (inference_params && !this.unloaded && this.active_discovery_adapter.key === 'legacy'
      && derived.get_snapshot().invalidation_revision === derived_revision) {
      await this.prepare_adapter(derived, { ...inference_params, force: false });
      return this.get_discovery_state(params);
    }
    return state;
  }

  get active_discovery_adapter() {
    return this.discovery_adapters[has_template_base_config(this.settings) ? 'bases' : 'legacy'];
  }

  /** Validate a complete settings draft before publishing it. No queries here. */
  set_base_settings(settings) {
    const next = { ...this.settings, ...settings };
    parse_template_base_config(next);
    for (const key of ['template_base', 'template_base_view', 'template_base_scopes']) {
      next[key] = String(next[key] || '').trim();
    }
    this.env.settings.smart_templates = next;
    this.invalidate_templates({ reason: 'settings' });
    this.notify_templates('templates:index_changed', { adapter_key: this.active_discovery_adapter.key, status: 'stale' });
  }

  /** Observer failure cannot undo published settings, catalog, or ownership. */
  notify_templates(event_key, payload) {
    try {
      this.emit_event(event_key, payload);
    } catch (error) {
      console.error(`SmartTemplates: notification failed after ${event_key}`, error);
    }
  }

  /** A historical removal intent is not proof that the source is still absent. */
  is_source_removal_pending(source_key) {
    const source_path = source_key.split('#')[0];
    const affected = [...this._removed_source_paths].some((path) => source_path === path || source_path.startsWith(`${path}/`));
    if (!affected) return false;
    const app = get_scope_app(this);
    // Native vault identity also detects removed folder descendants whose old
    // source-index entries have not caught up yet. This is a synchronous lookup.
    if (app?.vault?.getAbstractFileByPath) return !app.vault.getAbstractFileByPath(source_path);
    const source = this.env.smart_sources?.get(source_path);
    return !source || source.deleted === true;
  }

  /** Delay catalog cleanup until preparation, never scan/save in event callbacks. */
  reconcile_removed_sources() {
    if (!this._removed_source_paths.size) return;
    let changed = false;
    for (const item of Object.values(this.items)) {
      const source_key = item.data.source_key;
      if (!source_key || item.deleted || item.data.built_in) continue;
      if (this.is_source_removal_pending(source_key)) {
        item.delete();
        changed = true;
      }
    }
    this._removed_source_paths.clear();
    if (changed) this.queue_save();
  }

  /** Ordinary preparation never starts inference, even when candidates are stale. */
  async prepare_templates(params = {}) {
    return await this.prepare_adapter(this.active_discovery_adapter, params);
  }

  /** Coalesce the same request and never commit an invalidated/unloaded result. */
  async prepare_adapter(adapter, params = {}) {
    if (this.unloaded) return null;
    if (!this.is_adapter_active(adapter)) return this.get_discovery_state(params);
    if (adapter === this.discovery_adapters.derived_headings) adapter.configure(params);
    if (!this._templates_loading) this.reconcile_removed_sources();
    if (params.force) adapter.invalidate({ reason: 'forced_refresh' });
    const snapshot = adapter.get_snapshot(params);
    if (snapshot.status === 'ready' && !params.force) return snapshot;
    const request_key = JSON.stringify([adapter.key, snapshot.scope_key, snapshot.invalidation_revision]);
    if (this._preparations.has(request_key)) return await this._preparations.get(request_key);
    const invalidation_revision = adapter.get_snapshot(params).invalidation_revision;
    const preparation = (async () => {
      try {
        if (this._templates_loading) throw new Error('Template storage is still loading.');
        const candidate = await adapter.prepare(params);
        if (this.unloaded) return null;
        if (!this.is_adapter_active(adapter)) return this.get_discovery_state(params);
        // Re-check settings as well as event invalidation after the await boundary.
        adapter.get_snapshot(params);
        if (!adapter.is_current(candidate)) return adapter.get_snapshot(params);
        return this.reconcile_adapter_candidate(adapter, candidate);
      } catch (error) {
        if (!this.unloaded && this.is_adapter_active(adapter)
          && adapter.get_scope_key(params) === snapshot.scope_key
          && adapter.get_snapshot(params).invalidation_revision === invalidation_revision) {
          const failed = adapter.fail(params, error);
          this.notify_templates('templates:index_changed', { adapter_key: adapter.key, status: failed.status });
          if (adapter.key === 'bases') this.notify_templates('templates:base_warning', {
            level: 'warning', message: failed.issues[0].message, scope_source_key: params.scope_source_key ?? null,
          });
          return failed;
        }
        return this.unloaded ? null : this.get_discovery_state(params);
      }
    })();
    this._preparations.set(request_key, preparation);
    try {
      return await preparation;
    } finally {
      if (this._preparations.get(request_key) === preparation) this._preparations.delete(request_key);
    }
  }

  is_adapter_active(adapter) {
    return this.active_discovery_adapter === adapter
      || (adapter === this.discovery_adapters.derived_headings && this.active_discovery_adapter.key === 'legacy');
  }

  /**
   * Validate the entire candidate before changing the catalog. Adapter ownership
   * is narrow; an ensure-only snapshot never authorizes pruning another scope.
   *
   * @param {import('../adapters/smart-templates/_adapter.js').SmartTemplatesAdapter} adapter
   * @param {object} candidate
   * @returns {object} The committed adapter snapshot.
   */
  reconcile_adapter_candidate(adapter, candidate) {
    if (this.unloaded || this.discovery_adapters[adapter.key] !== adapter
      || candidate.adapter_key !== adapter.key || !adapter.is_current(candidate)) {
      throw new Error('Invalid or stale template discovery candidate.');
    }
    if (!Array.isArray(candidate.records) || !Array.isArray(candidate.visible_keys) || !Array.isArray(candidate.issues)) {
      throw new Error('Template discovery requires records, visible_keys, and issues arrays.');
    }
    if (!['ensure', 'authoritative'].includes(adapter.reconcile_mode)) {
      throw new Error('Invalid template reconciliation mode.');
    }
    const record_keys = new Set();
    const suppressed_keys = new Set();
    const upserts = [];
    for (const record of candidate.records) {
      const { key, data } = record;
      if (typeof key !== 'string' || !key.trim() || record_keys.has(key)) {
        throw new Error(`Invalid or duplicate template key: ${key}`);
      }
      if (!data || typeof data !== 'object' || Array.isArray(data) || (data.key !== undefined && data.key !== key)) {
        throw new Error(`Invalid template record: ${key}`);
      }
      if (data.source_key ? data.source_key !== key : typeof data.content !== 'string') {
        throw new Error(`Invalid template content identity: ${key}`);
      }
      if (data.built_in || (data.transient === true && data.provider_key !== adapter.key)) {
        throw new Error(`Invalid template discovery owner: ${key}`);
      }
      record_keys.add(key);
      const existing = this.get(key);
      if (existing && !existing.deleted) {
        if (existing.data.transient !== true && data.transient === true) {
          const previous_signature = existing.data.provenance?.signature;
          if (previous_signature && data.provenance?.signature && previous_signature !== data.provenance.signature) {
            throw new Error(`Template signature collision: ${key}`);
          }
          suppressed_keys.add(key);
          continue;
        }
        if (existing.data.built_in
          || existing.data.source_key !== (data.source_key ?? null)
          || (existing.data.transient === true && (data.transient !== true || existing.data.provider_key !== adapter.key))) {
          throw new Error(`Template identity collision: ${key}`);
        }
        if (data.transient === true && existing.data.provenance?.signature !== data.provenance?.signature) {
          throw new Error(`Template signature collision: ${key}`);
        }
      }
      upserts.push({ key, data: { ...data, key } });
    }
    const visible_keys = new Set();
    for (const key of candidate.visible_keys) {
      if (typeof key !== 'string' || !key.trim() || visible_keys.has(key)) {
        throw new Error(`Invalid or duplicate visible template key: ${key}`);
      }
      const existing = this.get(key);
      if (!record_keys.has(key) && (!existing || existing.deleted || existing.data.transient === true)) {
        throw new Error(`Visible template has no catalog record: ${key}`);
      }
      visible_keys.add(key);
    }
    const prunes = adapter.reconcile_mode === 'authoritative'
      ? Object.values(this.items).filter((item) => !item.deleted && adapter.owns_item(item) && !record_keys.has(item.key))
      : [];

    // Only synchronous SmartTemplate operations occur in the commit section.
    // Keep local rollback state for a rejected item validation/update or commit.
    const original_items = { ...this.items };
    const original_state = new Map(Object.values(this.items).map((item) => [item, {
      data: item.data, deleted: item.deleted, queue_save: item._queue_save,
    }]));
    let changed = false;
    let committed;
    try {
      for (const { key, data } of upserts) {
        const existing = this.get(key);
        const previous = existing && original_state.get(existing);
        // update_data() deep-merges nested fields; isolate them for rollback.
        if (existing) existing.data = existing.sanitize_data(existing.data);
        const item = this.create_or_update(data);
        if (this.get(key) !== item) throw new Error(`Template validation failed: ${key}`);
        item.deleted = false;
        if (!existing || !deep_equal(previous.data, item.data) || previous.deleted) {
          item.queue_save();
          changed = true;
        } else {
          item.data = previous.data;
          item._queue_save = previous.queue_save;
        }
      }
      for (const item of prunes) {
        if (item.data.transient === true) {
          item._queue_save = false;
          delete this.items[item.key];
        } else {
          item.delete();
        }
        changed = true;
      }
      committed = adapter.commit({
        ...candidate,
        records: candidate.records.filter((record) => !suppressed_keys.has(record.key)),
        visible_keys: candidate.visible_keys.filter((key) => !suppressed_keys.has(key)),
      });
    } catch (error) {
      for (const key of Object.keys(this.items)) delete this.items[key];
      Object.assign(this.items, original_items);
      for (const [item, state] of original_state) {
        item.data = state.data;
        item.deleted = state.deleted;
        item._queue_save = state.queue_save;
      }
      throw error;
    }
    if (changed) {
      try {
        this.queue_save();
      } catch (error) {
        // Item dirty flags remain pending. This is a scheduling failure, not a
        // failed discovery snapshot or an asynchronous writer acknowledgment.
        console.error('SmartTemplates: committed catalog saving could not be queued', error);
        this.notify_templates('templates:persistence_warning', {
          level: 'warning', message: 'Templates updated in memory, but saving could not be queued.',
          details: error.message,
        });
      }
    }
    // Presentation notification cannot roll back a successfully committed catalog.
    this.notify_templates('templates:index_changed', { adapter_key: adapter.key, status: committed.status });
    if (adapter.key === 'bases' && committed.issues.length) this.notify_templates('templates:base_warning', {
      level: 'warning', message: committed.issues.map((issue) => issue.message).join(' '),
      scope_source_key: candidate.scope_source_key,
    });
    return committed;
  }

  /** One synchronous catalog-visibility policy, shared by template selectors. */
  get_visible_templates(params = {}) {
    if (this.unloaded) return [];
    const keys = new Set();
    for (const item of Object.values(this.items)) {
      if (!item.deleted && (item.data.built_in
        || (!item.data.source_key && item.data.transient !== true && typeof item.data.content === 'string'))) {
        keys.add(item.key);
      }
    }
    const snapshot = this.active_discovery_adapter.get_snapshot(params);
    for (const key of snapshot.visible_keys) keys.add(key);
    if (this.active_discovery_adapter.key === 'legacy') {
      for (const key of this.discovery_adapters.derived_headings.get_snapshot().visible_keys) keys.add(key);
    }
    return [...keys].map((key) => this.get(key)).filter((item) => {
      return item && !item.deleted && (!item.data.source_key || (item.source && !item.source.deleted
        && !this.is_source_removal_pending(item.data.source_key)));
    });
  }

  get_discovery_state(params = {}) {
    if (this.unloaded) return null;
    const state = this.active_discovery_adapter.get_snapshot(params);
    return state.adapter_key === 'legacy'
      ? { ...state, derived: this.discovery_adapters.derived_headings.get_snapshot() }
      : state;
  }

  /** Synchronous ownership transfer. Normal persistence is queued, not awaited. */
  confirm_template(item) {
    if (this.unloaded || this._templates_loading || item.collection !== this
      || this.get(item.key) !== item || item.deleted) {
      throw new Error('The inferred template is no longer available for confirmation.');
    }
    const data = item.data;
    if (data.transient === false && data.provider_key === null && data.provenance?.origin === 'derived_headings') {
      if (item._queue_save) {
        // Retry only the existing dirty save. Never detach or transfer again;
        // a scheduling error leaves the confirmed ownership and dirty flag intact.
        this.queue_save();
        this.notify_templates('templates:index_changed', {
          adapter_key: 'derived_headings', template_key: item.key, confirmation_queued: true,
        });
      }
      return item;
    }
    if (data.transient !== true || data.provider_key !== 'derived_headings' || data.source_key
      || data.built_in || typeof data.content !== 'string' || !data.content.trim()
      || typeof data.provenance?.signature !== 'string' || !data.provenance.signature) {
      throw new Error('This template is not an inferred candidate that can be confirmed.');
    }
    const pending_save = item._queue_save;
    item.data = { ...data, transient: false, provider_key: null,
      provenance: { ...data.provenance, origin: 'derived_headings' } };
    try {
      item.queue_save();
      this.queue_save();
    } catch (error) {
      item.data = data;
      item._queue_save = pending_save;
      throw error;
    }
    this.discovery_adapters.derived_headings.detach_item(item.key);
    this.notify_templates('templates:index_changed', { adapter_key: 'derived_headings', template_key: item.key, confirmation_queued: true });
    return item;
  }

  invalidate_templates(event = {}) {
    for (const adapter of Object.values(this.discovery_adapters)) adapter.invalidate(event);
  }

  register_env_event_listeners() {
    this.unregister_env_event_listeners();
    if (!this.env.events) return;
    const event_names = [
      'sources:created', 'sources:deleted', 'sources:renamed', 'sources:modified',
      'sources:import_started', 'sources:import_completed', 'sources:reimport_completed', 'sources:imported',
    ];
    this._template_event_unsubscribers = event_names.map((reason) => {
      return this.env.events.on(reason, (payload = {}) => this.handle_source_event({ ...payload, reason }));
    }).filter(Boolean);
  }

  handle_source_event(payload = {}) {
    if (this.unloaded || (payload.collection_key && payload.collection_key !== 'smart_sources')) return;
    const path = payload.reason === 'sources:renamed' ? payload.old_path || payload.from
      : payload.reason === 'sources:deleted' ? get_template_event_paths(payload)[0] : null;
    // Noncatalog temporary Base files require neither cleanup nor membership work.
    if (path && (!/\.base$/i.test(path) || this.get(path))) this._removed_source_paths.add(path);
    this.invalidate_templates(payload);
  }

  unregister_env_event_listeners() {
    for (const unsubscribe of this._template_event_unsubscribers || []) unsubscribe();
    this._template_event_unsubscribers = [];
  }

  unload() {
    clearTimeout(this._debounce_queue_save);
    this.unregister_env_event_listeners();
    for (const adapter of Object.values(this.discovery_adapters)) adapter.unload();
    this._preparations.clear();
    this._removed_source_paths.clear();
    super.unload();
  }

  get settings() {
    return super.settings;
  }

  /** Compatibility predicate for callers of the previous discovery API. */
  get_template_matcher(params = {}) {
    return this.discovery_adapters.legacy.get_template_matcher(params);
  }

  get settings_config() {
    return {
      template_folder: {
        name: 'Templates folder',
        description: this.build_template_folder_description(),
        type: 'button',
        callback: (...args) => this.open_template_folder_modal(...args),
      },
      template_name: {
        name: 'Naming convention',
        description: 'Specifies the file name used to detect template notes.',
        type: 'text',
        default: '',
        callback: () => this.load_templates(),
      },
      template_headings: {
        name: 'Template headings',
        description: this.build_template_headings_description(),
        type: 'button',
        callback: (...args) => this.open_template_headings_modal(...args),
      },
    };
  }

  build_template_headings_description(template_headings = this.settings?.template_headings) {
    if (!template_headings) {
      return 'Select headings to import matching blocks as templates.';
    }
    return `Headings: ${template_headings}`;
  }

  build_template_folder_description(template_folder = this.settings?.template_folder) {
    const folders = parse_template_folders({ template_folder });
    if (!folders.length) {
      return 'Select a folder to import matching notes as templates.';
    }
    return `Folders: ${folders.join(', ')}`;
  }

  async open_template_headings_modal(_, setting) {
    const ModalClass = get_modal_class(this, 'template_headings');
    const app = get_scope_app(this);
    if (!ModalClass || !app) return;

    const on_change = (csv) => {
      if (setting) {
        setting.setDesc(this.build_template_headings_description(csv));
      }
      this.load_templates();
    };

    const modal = new ModalClass(app, {
      scope: this,
      on_change,
    });
    modal.open();
  }

  async open_template_folder_modal(_, setting) {
    const ModalClass = get_modal_class(this, 'template_folder');
    const app = get_scope_app(this);
    if (!ModalClass || !app) return;

    const on_change = (csv) => {
      if (this.settings) {
        this.settings.template_folder = csv;
      }
      if (setting) {
        setting.setDesc(this.build_template_folder_description(csv));
      }
      this.load_templates();
    };

    const modal = new ModalClass(app, {
      scope: this,
      on_change,
    });
    modal.open();
  }
}

export default {
  class: SmartTemplates,
  collection_key: 'smart_templates',
  data_adapter: TransientAjsonSingleFileCollectionDataAdapter,
  item_type: SmartTemplate,
};
