import test from 'ava';
import { create_env, CandidateFixtureAdapter, fixture_candidate } from '../../test_support/templates.js';

test('P2-01/14/15: candidate is uncommitted; success/failure preserves last-good revision and data', (t) => {
  const { templates } = create_env(t);
  const adapter = new CandidateFixtureAdapter(templates);
  t.is(adapter.get_snapshot().status, 'unprepared');
  adapter.fail({}, new Error('offline'));
  t.is(adapter.get_snapshot().status, 'unavailable');
  t.is(adapter.get_snapshot().revision, 0);
  const candidate = fixture_candidate(adapter, ['candidate:A']);
  t.deepEqual(Object.keys(templates.items), []);
  t.deepEqual(adapter.get_snapshot().visible_keys, []);
  adapter.commit(candidate);
  adapter.invalidate();
  t.is(adapter.get_snapshot().status, 'stale');
  adapter.fail({}, new Error('later failure'));
  t.is(adapter.get_snapshot().status, 'last_good');
  t.is(adapter.get_snapshot().revision, 1);
  t.deepEqual(adapter.get_snapshot().visible_keys, ['candidate:A']);
});

test('P2-03: invalidation performs bookkeeping only and stale candidates cannot commit', (t) => {
  const { templates, writes } = create_env(t);
  const adapter = new CandidateFixtureAdapter(templates);
  const candidate = fixture_candidate(adapter, ['candidate:A']);
  adapter.invalidate({ path: 'note.md' });
  t.false(adapter.is_current(candidate));
  t.throws(() => adapter.commit(candidate), { message: /invalidated/ });
  t.deepEqual(writes, []);
  t.deepEqual(Object.keys(templates.items), []);
  adapter.unload();
  t.false(adapter.is_current(candidate));
});
