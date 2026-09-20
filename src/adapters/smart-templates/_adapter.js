/**
 * Collection-owned discovery lifecycle. prepare() returns a candidate, never a
 * catalog mutation. Only the collection commits after reconciliation succeeds.
 * No module-global state, persistence, or host event registration lives here.
 */
export class SmartTemplatesAdapter {
  constructor(collection) {
    this.collection = collection;
    this.env = collection.env;
    this.snapshots = new Map();
    this.unloaded = false;
  }

  get key() { throw new Error('SmartTemplatesAdapter.key not implemented'); }
  get reconcile_mode() { return 'ensure'; }
  get_scope_key(params = {}) { return 'global'; }

  async prepare(params = {}) {
    throw new Error('SmartTemplatesAdapter.prepare not implemented');
  }

  /** @returns {object} The committed snapshot; callers must not mutate it. */
  get_snapshot(params = {}) {
    const scope_key = this.get_scope_key(params);
    if (!this.snapshots.has(scope_key)) {
      this.snapshots.set(scope_key, {
        adapter_key: this.key,
        scope_key,
        status: 'unprepared',
        revision: 0,
        invalidation_revision: 0,
        records: [],
        visible_keys: [],
        issues: [],
      });
    }
    return this.snapshots.get(scope_key);
  }

  /** Capture the invalidation revision BEFORE preparation can yield. */
  create_candidate(params = {}) {
    const snapshot = this.get_snapshot(params);
    return {
      adapter_key: this.key,
      scope_key: snapshot.scope_key,
      invalidation_revision: snapshot.invalidation_revision,
      records: [],
      visible_keys: [],
      issues: [],
    };
  }

  is_current(candidate) {
    return !this.unloaded
      && this.snapshots.get(candidate.scope_key)?.invalidation_revision === candidate.invalidation_revision;
  }

  commit(candidate) {
    if (!this.is_current(candidate)) throw new Error('Template discovery was invalidated during preparation.');
    const previous = this.snapshots.get(candidate.scope_key);
    const snapshot = {
      ...candidate,
      records: candidate.records.map(({ key, data }) => ({ key, data: { ...data } })),
      visible_keys: [...candidate.visible_keys],
      issues: [...candidate.issues],
      status: 'ready',
      revision: previous.revision + 1,
    };
    this.snapshots.set(candidate.scope_key, snapshot);
    return snapshot;
  }

  fail(params = {}, error) {
    const previous = this.get_snapshot(params);
    const snapshot = {
      ...previous,
      status: previous.revision ? 'last_good' : 'unavailable',
      issues: [{ message: error.message || String(error) }],
    };
    this.snapshots.set(previous.scope_key, snapshot);
    return snapshot;
  }

  /** Mark state only. Event callbacks must never read, scan, import, or save. */
  invalidate(event = {}) {
    for (const snapshot of this.snapshots.values()) {
      snapshot.invalidation_revision += 1;
      if (snapshot.revision) snapshot.status = 'stale';
    }
  }

  owns_item(item) { return false; }

  unload() {
    this.unloaded = true;
    this.snapshots.clear();
  }
}
