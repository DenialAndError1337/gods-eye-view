import test from 'node:test';
import assert from 'node:assert/strict';
import { createIngestion, createMilitaryFeed } from './ingestion.js';
function setup(source) {
  const feed = createMilitaryFeed(source);
  const accepted = [];
  const labels = [];
  const restores = [];
  const { methods } = createIngestion({
    feed,
    applySnapshot: (snapshot) => {
      accepted.push(snapshot);
      return { count: 1, ids: new Set(['aaa001']) };
    },
    setSourceLabel: (label) => labels.push(label),
    applyPendingTrackingRestore: () => restores.push(true),
  });
  return { feed, accepted, labels, restores, update: methods.update };
}

test('military acquisition cancels late replies without publishing or restoring tracking', async () => {
  let release;
  const probe = setup({
    getSnapshot: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const request = probe.update(null);
  assert.equal(probe.feed._activeUpdateControllers.size, 1);
  for (const controller of probe.feed._activeUpdateControllers)
    controller.abort();
  release({ records: [] });
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(probe.accepted.length, 0);
  assert.equal(probe.restores.length, 0);
  assert.equal(probe.feed._activeUpdateControllers.size, 0);
});

test('military acquisition keeps the degraded source reason and respects retry admission', async () => {
  let calls = 0;
  const probe = setup({
    async getSnapshot() {
      calls++;
      return {
        records: [],
        source: 'Fixture',
        observedAtMs: 1234,
        freshness: 'stale',
        stale: true,
        reason: 'Upstream refreshing',
      };
    },
  });
  await probe.update(null);
  assert.equal(probe.feed._lastUpdate, 1234);
  assert.equal(probe.feed._lastError, 'Upstream refreshing');
  assert.equal(probe.feed._backoff, true);
  assert.deepEqual(probe.labels, ['Fixture']);
  probe.feed._retryAt = Date.now() + 60000;
  await probe.update(null);
  assert.equal(calls, 1);
  assert.equal(probe.restores.length, 1);
  assert.equal(
    probe.feed._lastTrackingRefreshOutcome.status,
    'source-unavailable',
  );
});

const snapshot = (patch = {}) => ({
  records: [],
  source: 'Military fixture',
  observedAtMs: 500,
  freshness: 'fresh',
  stale: false,
  ...patch,
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

test('military attempts distinguish source time, clean/degraded acceptance, failure and skipped backoff', async (t) => {
  let at = 1000,
    mode = 'fresh',
    calls = 0;
  t.mock.method(Date, 'now', () => at);
  const probe = setup({
    async getSnapshot() {
      calls++;
      if (mode === 'fail')
        throw Object.assign(new Error('outage'), { retryAfterMs: 5000 });
      return snapshot(
        mode === 'stale'
          ? { stale: true }
          : mode === 'unknown'
            ? { freshness: 'unknown', observedAtMs: null }
            : {},
      );
    },
  });
  assert.equal(probe.feed._acquisitionHealth.outcome, 'never');
  await probe.update(null);
  assert.deepEqual(probe.feed._acquisitionHealth, {
    lastAttempt: 1000,
    lastCompletion: 1000,
    lastAccepted: 1000,
    lastSuccess: 1000,
    outcome: 'accepted',
  });
  assert.equal(probe.feed._lastUpdate, 500);
  at = 2000;
  mode = 'stale';
  await probe.update(null);
  assert.equal(probe.feed._acquisitionHealth.outcome, 'degraded');
  assert.equal(probe.feed._acquisitionHealth.lastSuccess, 1000);
  assert.equal(probe.feed._acquisitionHealth.lastAccepted, 2000);
  at = 3000;
  mode = 'unknown';
  await probe.update(null);
  assert.equal(probe.feed._acquisitionHealth.outcome, 'degraded');
  assert.equal(probe.feed._lastUpdate, null);
  at = 4000;
  mode = 'fail';
  await probe.update(null);
  const failed = { ...probe.feed._acquisitionHealth };
  assert.equal(failed.outcome, 'failed');
  assert.equal(failed.lastAccepted, 3000);
  assert.equal(failed.lastSuccess, 1000);
  at = 5000;
  await probe.update(null);
  assert.deepEqual(probe.feed._acquisitionHealth, failed);
  assert.equal(calls, 4);
  at = 9000;
  mode = 'fresh';
  await probe.update(null);
  assert.equal(probe.feed._acquisitionHealth.lastSuccess, 9000);
});

test('pre-aborted military updates make no attempt; cancelled pending calls preserve previous acceptance', async (t) => {
  let at = 1000;
  t.mock.method(Date, 'now', () => at);
  const late = deferred();
  let calls = 0;
  const probe = setup({
    getSnapshot() {
      return ++calls === 1 ? snapshot() : late.promise;
    },
  });
  await probe.update(null);
  const before = { ...probe.feed._acquisitionHealth };
  await assert.rejects(probe.update(null, { signal: AbortSignal.abort() }), {
    name: 'AbortError',
  });
  assert.equal(calls, 1);
  assert.deepEqual(probe.feed._acquisitionHealth, before);
  const controller = new AbortController();
  at = 2000;
  const pending = probe.update(null, { signal: controller.signal });
  assert.equal(probe.feed._acquisitionHealth.outcome, 'pending');
  assert.equal(probe.feed._acquisitionHealth.lastCompletion, 1000);
  controller.abort();
  at = 3000;
  late.resolve(snapshot());
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(probe.feed._acquisitionHealth.outcome, 'cancelled');
  assert.equal(probe.feed._acquisitionHealth.lastCompletion, 3000);
  assert.equal(probe.feed._acquisitionHealth.lastAccepted, 1000);
  assert.equal(probe.restores.length, 1);
});

test('superseded military response or failure cannot overwrite a newer snapshot, retry or history', async (t) => {
  for (const rejectOld of [false, true]) {
    let at = 1000;
    t.mock.method(Date, 'now', () => at);
    const old = deferred();
    let calls = 0;
    const probe = setup({
      getSnapshot() {
        return ++calls === 1
          ? old.promise
          : snapshot({ source: 'New source', observedAtMs: 200 });
      },
    });
    const first = probe.update(null);
    const cancelled = assert.rejects(first, { name: 'AbortError' });
    at = 2000;
    await probe.update(null);
    const history = { ...probe.feed._acquisitionHealth };
    at = 3000;
    if (rejectOld) old.reject(new Error('old outage'));
    else old.resolve(snapshot({ source: 'Old source', observedAtMs: 100 }));
    await cancelled;
    assert.deepEqual(probe.feed._acquisitionHealth, history);
    assert.equal(probe.feed._lastUpdate, 200);
    assert.equal(probe.feed._retryAt, 0);
    assert.deepEqual(probe.labels, ['New source']);
    assert.equal(probe.accepted.length, 1);
    assert.equal(probe.restores.length, 1);
    assert.equal(probe.feed._lastTrackingRefreshOutcome.epoch, 2);
    assert.equal(probe.feed._lastTrackingRefreshOutcome.source, 'New source');
    t.mock.restoreAll();
  }
});

test('replaced military lifetime ignores a late response and retains reset history', async () => {
  const { createMilitaryAcquisitionHealth } = await import('./ingestion.js');
  const late = deferred();
  const probe = setup({ getSnapshot: () => late.promise });
  const pending = probe.update(null);
  const cancelled = assert.rejects(pending, { name: 'AbortError' });
  probe.feed._acquisitionHealth = createMilitaryAcquisitionHealth();
  late.resolve(snapshot());
  await cancelled;
  assert.equal(probe.feed._acquisitionHealth.outcome, 'never');
  assert.equal(probe.accepted.length, 0);
  assert.equal(probe.feed._activeUpdateControllers.size, 0);
});

test('military public stats and shared snapshots copy acquisition health and retain source age/retry deadline', async () => {
  const { createQueries } = await import('./queries.js');
  const { layerSnapshot } = await import('../../data/layerSnapshot.js');
  const probe = setup({ getSnapshot: async () => snapshot() });
  await probe.update(null);
  probe.feed._retryAt = Date.now() + 5000;
  const queries = createQueries({
    flightState: { feed: probe.feed },
    services: { aircraftPresentation: {}, labels: {}, camera: {} },
    parts: {},
    layer: {},
  });
  const stats = queries.methods.getStats();
  assert.equal(stats.retryAt, probe.feed._retryAt);
  const snap = layerSnapshot(
    { id: 'military', enabled: true, stats },
    { now: 2500 },
  );
  assert.equal(snap.ageSec, 2);
  assert.equal(snap.lastUpdate, 500);
  const accepted = probe.feed._acquisitionHealth.lastAccepted;
  stats.acquisitionHealth.lastAccepted = 1;
  snap.acquisitionHealth.lastAccepted = 2;
  assert.equal(probe.feed._acquisitionHealth.lastAccepted, accepted);
  assert.equal(
    queries.methods.getStats().acquisitionHealth.lastAccepted,
    accepted,
  );
  assert.equal(snap.retryAt, probe.feed._retryAt);
});
