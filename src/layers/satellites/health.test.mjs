import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogHealth, satelliteHealthStats } from './health.js';
import { createIngestion } from './ingestion.js';
import { createCatalog } from './catalog.js';
import { createSatelliteSource } from './source.js';

test('cache acquisition provenance survives fresh, stale, partial and unknown timestamps', () => {
  const results = [
    { path: 'stations', ok: true, stale: true, fetchedAt: 100 },
    { path: 'visual', ok: true, fetchedAt: 300 },
    { path: 'geo', ok: false },
  ];
  const core = catalogHealth(results, 500);
  assert.deepEqual(core, {
    failedGroups: ['geo'],
    staleGroups: ['stations'],
    fetchedAt: 100,
    acceptedAt: 500,
  });
  const state = {
    _coreHealth: core,
    _denseHealth: catalogHealth(
      [{ path: 'starlink', ok: true, stale: true, fetchedAt: 50 }],
      600,
    ),
    _params: { catalog: 'dense' },
    _count: 10,
    _lastAttempt: 490,
    _lastError: null,
  };
  assert.equal(satelliteHealthStats(state).cacheFetchedAt, 50);
  assert.equal(satelliteHealthStats(state).status, 'degraded');
  assert.deepEqual(satelliteHealthStats(state).staleGroups, [
    'stations',
    'starlink',
  ]);
  state._params.catalog = 'core';
  assert.equal(satelliteHealthStats(state).cacheFetchedAt, 100);
  assert.equal(catalogHealth([{ ok: true, stale: true }], 700).fetchedAt, null);
  assert.equal(
    catalogHealth([{ ok: true, stale: false }], 700).fetchedAt,
    null,
  );
});

test('satellite source retains stale timestamp and rejects malformed or future metadata', async () => {
  for (const [header, expected] of [
    ['100', 100],
    ['', null],
    ['nope', null],
    [String(Date.now() + 100000), null],
  ]) {
    const source = createSatelliteSource({
      fetchImpl: async () =>
        new Response('TLE', {
          headers: { 'x-tle-cache': 'STALE-ERROR', 'x-tle-fetched-at': header },
        }),
    });
    const result = await source.readGroup('stations');
    assert.equal(result.stale, true);
    assert.equal(result.fetchedAt, expected);
  }
});

test('actual catalog ingestion preserves stale age, retains catalog on outage, recovers and cancels', async () => {
  let mode = 'stale';
  const state = {
    _trackingRefreshEpoch: 0,
    _activeUpdateControllers: new Set(),
    _pointCollection: { removeAll() {} },
    _points: new Map(),
    _orbitPaths: new Map(),
    _catalog: new Map(),
    _detectionObjects: new Map(),
    _denseLoadToken: 0,
    _catalogRevision: 0,
    _params: { catalog: 'core', showOrbits: false },
  };
  const entry = {
    name: 'ISS',
    line1:
      '1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927',
    line2:
      '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537',
  };
  const noop = () => {};
  const parts = {
    orbits: { parseTLE: () => [entry], propagatePosition: () => null },
    labels: { _syncIssOverlay: noop },
    rendering: { _showOrbitPath: noop },
    tracking: {
      _reconcileTrackedSubjectContext: noop,
      _applyPendingTrackingRestore: noop,
    },
  };
  const source = {
    readGroup: async () => ({
      ok: mode !== 'failed',
      text: 'fixture',
      stale: mode === 'stale',
      fetchedAt: mode === 'stale' ? 100 : 300,
    }),
  };
  const { methods } = createIngestion({ state, parts, source, services: {} });
  const viewer = { scene: { primitives: { remove: noop } } };
  await methods.update(viewer);
  assert.equal(state._lastUpdate, 100);
  assert.equal(state._coreHealth.staleGroups.length, 6);
  const acceptedAt = state._coreHealth.acceptedAt;
  mode = 'failed';
  await methods.update(viewer);
  assert.equal(state._catalog.size, 1);
  assert.equal(state._lastUpdate, 100);
  assert.equal(state._coreHealth.acceptedAt, acceptedAt);
  assert.equal(satelliteHealthStats(state).status, 'unavailable');
  mode = 'fresh';
  await methods.update(viewer);
  assert.equal(state._lastUpdate, 300);
  assert.deepEqual(state._coreHealth.staleGroups, []);
  assert.equal(satelliteHealthStats(state).status, 'nominal');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(methods.update(viewer, { signal: controller.signal }), {
    name: 'AbortError',
  });
  assert.equal(state._activeUpdateControllers.size, 0);
  assert.equal(state._lastUpdate, 300);
});

test('dense catalog carries stale provenance and removes it when returning to core', async () => {
  const noop = () => {};
  const state = {
    _viewer: {},
    _pointCollection: { add: () => ({}), remove: noop },
    _denseLoadToken: 0,
    _params: { catalog: 'dense' },
    _catalog: new Map(),
    _points: new Map(),
    _denseIds: [],
    _catalogRevision: 0,
    _trackedNorad: null,
  };
  const parts = {
    controls: { _notifyRowControls: noop },
    tracking: { _applyPendingTrackingRestore: noop },
    orbits: {
      parseTLE: () => [
        {
          name: 'fixture',
          line1:
            '1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927',
          line2:
            '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537',
        },
      ],
      propagatePosition: () => ({
        longitude: 0,
        latitude: 0,
        altitude: 400000,
      }),
    },
  };
  const catalog = createCatalog({
    state,
    parts,
    services: {},
    source: {
      readGroup: async () => ({
        ok: true,
        text: 'fixture',
        stale: true,
        fetchedAt: 123,
      }),
    },
  });
  assert.equal((await catalog._loadDenseCatalog()).status, 'ready');
  assert.deepEqual(state._denseHealth.staleGroups, ['starlink']);
  assert.equal(satelliteHealthStats(state).stale, true);
  assert.equal(satelliteHealthStats(state).cacheFetchedAt, 123);
  catalog._removeDenseCatalog();
  assert.equal(state._denseHealth, null);
  assert.equal(state._points.size, 0);
});
