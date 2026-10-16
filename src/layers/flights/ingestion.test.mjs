import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlightFeed, createIngestion } from './ingestion.js';

function setup(source) {
  const feed = createFlightFeed(source);
  const accepted = [];
  const labels = [];
  const restores = [];
  const { methods } = createIngestion({
    feed,
    getQuery: () => ({ latitude: 39 }),
    applySnapshot: (snapshot) => {
      accepted.push(snapshot);
      return { count: 2, ids: new Set(['abc123']) };
    },
    setSourceLabel: (label) => labels.push(label),
    applyPendingTrackingRestore: () => restores.push(true),
  });
  return { feed, accepted, labels, restores, update: methods.update };
}

test('civil acquisition rejects late completion after cancellation without publishing records', async () => {
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

test('civil acquisition publishes source time and uses a replaced source on the next request', async () => {
  let calls = 0;
  const probe = setup({
    async getSnapshot(query) {
      assert.equal(query.latitude, 39);
      calls += 1;
      return {
        records: [],
        source: 'First',
        observedAtMs: 1234,
        freshness: 'fresh',
        coverage: 'worldwide',
      };
    },
  });
  await probe.update(null);
  assert.equal(probe.feed._lastUpdate, 1234);
  assert.equal(probe.feed._count, 2);
  assert.deepEqual([...probe.feed._lastTrackingRefreshOutcome.ids], ['abc123']);
  probe.feed._source = {
    async getSnapshot() {
      return {
        records: [],
        source: 'Second',
        observedAtMs: 1250,
        freshness: 'unknown',
      };
    },
  };
  await probe.update(null);
  assert.equal(calls, 1);
  assert.equal(probe.feed._lastUpdate, 1250);
  assert.equal(probe.feed._backoff, true);
  assert.equal(probe.feed._lastError, 'Source snapshot time unavailable');
  assert.deepEqual(probe.labels, ['First', 'Second']);
  assert.equal(probe.restores.length, 2);
});

test('snapshot request history covers direct updates, preserves source age and separates degraded acceptance', async (t) => {
  let clock = 10000;
  t.mock.method(Date, 'now', () => clock);
  const probe = setup({
    async getSnapshot() {
      clock += 100;
      return { source: 'Fixture', observedAtMs: 1000, freshness: 'fresh' };
    },
  });
  assert.equal(probe.feed._acquisitionHealth.outcome, 'never');
  await probe.update(null);
  assert.deepEqual(probe.feed._acquisitionHealth, {
    lastAttempt: 10000,
    lastCompletion: 10100,
    lastAccepted: 10100,
    lastSuccess: 10100,
    outcome: 'accepted',
  });
  probe.feed._source.getSnapshot = async () => {
    clock += 100;
    return { source: 'Fixture', observedAtMs: 1000, stale: true, ageMs: 9000 };
  };
  await probe.update(null);
  assert.equal(probe.feed._lastUpdate, 1000);
  assert.equal(probe.feed._acquisitionHealth.lastAccepted, 10200);
  assert.equal(probe.feed._acquisitionHealth.lastSuccess, 10100);
  assert.equal(probe.feed._acquisitionHealth.outcome, 'degraded');
});

test('failed request retains acceptance; backoff skips and pre-aborted calls are not attempts', async (t) => {
  let clock = 10000;
  t.mock.method(Date, 'now', () => clock);
  const probe = setup({
    async getSnapshot() {
      return { observedAtMs: 1000 };
    },
  });
  await probe.update(null);
  clock = 11000;
  probe.feed._source.getSnapshot = async () => {
    throw new Error('fixture outage');
  };
  await probe.update(null);
  assert.equal(probe.feed._acquisitionHealth.outcome, 'failed');
  assert.equal(probe.feed._acquisitionHealth.lastAccepted, 10000);
  const previous = { ...probe.feed._acquisitionHealth };
  await probe.update(null);
  assert.deepEqual(probe.feed._acquisitionHealth, previous);
  probe.feed._retryAt = 0;
  await assert.rejects(probe.update(null, { signal: AbortSignal.abort() }), {
    name: 'AbortError',
  });
  assert.deepEqual(probe.feed._acquisitionHealth, previous);
  assert.equal(probe.feed._activeUpdateControllers.size, 0);
  clock = 12000;
  probe.feed._source.getSnapshot = async () => ({
    observedAtMs: 1000,
    freshness: 'current',
  });
  await probe.update(null);
  assert.equal(probe.feed._acquisitionHealth.outcome, 'accepted');
  assert.equal(probe.feed._acquisitionHealth.lastSuccess, 12000);
  assert.equal(probe.feed._lastUpdate, 1000);
});

test('cancellation settles current request without advancing accepted or clean times', async () => {
  let release;
  const probe = setup({
    getSnapshot: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const pending = probe.update(null);
  assert.equal(probe.feed._acquisitionHealth.outcome, 'pending');
  for (const controller of probe.feed._activeUpdateControllers)
    controller.abort();
  release({ observedAtMs: 1 });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(probe.feed._acquisitionHealth.outcome, 'cancelled');
  assert.equal(probe.feed._acquisitionHealth.lastAccepted, null);
  assert.equal(probe.feed._acquisitionHealth.lastSuccess, null);
  assert.ok(probe.feed._acquisitionHealth.lastCompletion);
});

test('late cancelled work cannot replace the telemetry of a newer accepted request', async () => {
  let release;
  const probe = setup({
    getSnapshot: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const first = probe.update(null);
  for (const controller of probe.feed._activeUpdateControllers)
    controller.abort();
  probe.feed._source.getSnapshot = async () => ({ observedAtMs: 20 });
  await probe.update(null);
  const current = { ...probe.feed._acquisitionHealth };
  release({ observedAtMs: 10 });
  await assert.rejects(first, { name: 'AbortError' });
  assert.deepEqual(probe.feed._acquisitionHealth, current);
});

test('public aircraft stats copy request history and expose the existing retry deadline', async () => {
  const { default: flights } = await import('../../data/flights.js');
  const stats = flights.getStats();
  assert.equal(stats.acquisitionHealth.outcome, 'never');
  stats.acquisitionHealth.outcome = 'changed';
  assert.equal(flights.getStats().acquisitionHealth.outcome, 'never');
  assert.equal(stats.retryAt, undefined);
});
