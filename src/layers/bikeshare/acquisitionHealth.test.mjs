import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from './state.js';
import { createIngestion } from './ingestion.js';
import { createControls } from './controls.js';
import { createModel } from './model.js';
import { CITY_BY_ID } from './registry.js';

const cityId = 'toronto-bike-share';
const city = CITY_BY_ID.get(cityId);
const status = (bikes = 3) => ({
  data: {
    stations: [
      { station_id: 'one', num_bikes_available: bikes, num_docks_available: 5 },
    ],
  },
});
const information = () => ({
  data: {
    stations: [
      {
        station_id: 'one',
        name: 'Fixture dock',
        lat: city.centerLat,
        lon: city.centerLon,
        capacity: 8,
      },
    ],
  },
});
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(acquire) {
  const services = {
    overlays: {
      setOverlayEntries() {},
      setOverlaySourceVisible() {},
      clearOverlaySource() {},
    },
  };
  const state = createState({ services });
  state._enabled = true;
  state._activeCityIds.add(cityId);
  const parts = {};
  const source = { getStations: acquire };
  const context = { state, services, parts, source };
  parts.model = createModel(context);
  const ingestion = createIngestion(context);
  const controls = createControls(context);
  return { state, ingestion, stats: controls.methods.getStats };
}

test('city info cache hits and coalesced callers do not invent acquisition attempts', async (t) => {
  let at = 1000;
  t.mock.method(Date, 'now', () => at);
  const pending = deferred();
  let calls = 0;
  const probe = setup(() => {
    calls++;
    return pending.promise;
  });
  const first = probe.ingestion.loadCityStationInfo(cityId, 1);
  at = 2000;
  const second = probe.ingestion.loadCityStationInfo(cityId, 1);
  assert.equal(calls, 1);
  assert.equal(
    probe.stats().cityAcquisitionHealth[0].information.lastAttempt,
    1000,
  );
  pending.resolve(information());
  await Promise.all([first, second]);
  assert.equal(
    probe.stats().cityAcquisitionHealth[0].information.lastAccepted,
    2000,
  );
  at = 3000;
  await probe.ingestion.loadCityStationInfo(cityId, 2);
  assert.equal(calls, 1);
  const row = probe.stats().cityAcquisitionHealth[0];
  assert.equal(row.information.lastCompletion, 2000);
  assert.equal(row.status, null);
  row.information.outcome = 'changed';
  assert.equal(
    probe.stats().cityAcquisitionHealth[0].information.outcome,
    'accepted',
  );
  assert.equal(
    probe.state._lastUpdate,
    null,
    'request time is not layer data time',
  );
});

test('status failure preserves accepted time, and recovery advances only its own channel', async (t) => {
  let at = 1000;
  t.mock.method(Date, 'now', () => at);
  let fail = false;
  const probe = setup(async (url) => {
    if (url === city.stationInformationUrl) return information();
    if (fail) throw new Error('fixture outage');
    return status();
  });
  await probe.ingestion.loadCityStationInfo(cityId, 1);
  await probe.ingestion.loadCityStationStatus(cityId, 1);
  at = 2000;
  fail = true;
  await assert.rejects(
    probe.ingestion.loadCityStationStatus(cityId, 1),
    /fixture outage/,
  );
  let row = probe.stats().cityAcquisitionHealth[0];
  assert.equal(row.status.outcome, 'failed');
  assert.equal(row.status.lastAccepted, 1000);
  assert.equal(probe.state._statusCache.get(cityId).timestamp, 1000);
  assert.equal(row.information.lastAttempt, 1000);
  at = 3000;
  fail = false;
  await probe.ingestion.loadCityStationStatus(cityId, 1);
  row = probe.stats().cityAcquisitionHealth[0];
  assert.equal(row.status.outcome, 'accepted');
  assert.equal(row.status.lastAccepted, 3000);
  assert.equal(row.information.lastAccepted, 1000);
});

test('aborted uncooperative responses cannot replace cache, history or a newer loading count', async () => {
  const old = deferred();
  const current = deferred();
  let calls = 0;
  const probe = setup(() => (++calls === 1 ? old.promise : current.promise));
  const first = probe.ingestion.loadCityStationStatus(cityId, 1);
  const rejected = assert.rejects(first, { name: 'AbortError' });
  probe.ingestion.abortInFlight(probe.state._inFlightStatus, cityId);
  assert.equal(
    probe.state._loading,
    false,
    'cancellation releases loading immediately',
  );
  assert.equal(
    probe.stats().cityAcquisitionHealth[0].status.outcome,
    'cancelled',
  );
  assert.equal(
    probe.stats().cityAcquisitionHealth[0].status.lastAccepted,
    null,
  );
  await rejected;
  const second = probe.ingestion.loadCityStationStatus(cityId, 2);
  old.resolve(status(1));
  await Promise.resolve();
  assert.equal(probe.state._statusCache.has(cityId), false);
  assert.equal(
    probe.state._loadingOps,
    1,
    'old settlement cannot release the new operation',
  );
  assert.equal(
    probe.stats().cityAcquisitionHealth[0].status.outcome,
    'pending',
  );
  current.resolve(status(7));
  await second;
  assert.equal(probe.state._loadingOps, 0);
  assert.equal(
    probe.stats().cityAcquisitionHealth[0].status.outcome,
    'accepted',
  );
  assert.equal(
    probe.state._statusCache.get(cityId).statusMap.get('one').bikesAvailable,
    7,
  );
});

test('a replaced layer lifetime cannot be modified by an old info request', async () => {
  const old = deferred();
  const current = deferred();
  let calls = 0;
  const probe = setup(() => (++calls === 1 ? old.promise : current.promise));
  const first = probe.ingestion.loadCityStationInfo(cityId, 1);
  const rejected = assert.rejects(first, { name: 'AbortError' });
  probe.state._cityAcquisitionHealth = new Map();
  probe.state._inFlightInfo = new Map();
  probe.state._loadingOps = 0;
  const second = probe.ingestion.loadCityStationInfo(cityId, 2);
  old.resolve(information());
  await rejected;
  assert.equal(probe.state._stationInfoCache.has(cityId), false);
  assert.equal(probe.state._loadingOps, 1);
  current.resolve(information());
  await second;
  assert.equal(probe.state._loadingOps, 0);
  assert.equal(probe.stats().cityAcquisitionHealth.length, 1);
});

test('unknown cities do not create histories or source requests', async () => {
  const probe = setup(() => assert.fail('must not acquire'));
  await assert.rejects(probe.ingestion.loadCityStationInfo('unknown-city', 1));
  await assert.rejects(
    probe.ingestion.loadCityStationStatus('unknown-city', 1),
  );
  assert.deepEqual(probe.stats().cityAcquisitionHealth, []);
});

test('one city recovery cannot overwrite a neighbouring city failure history', async (t) => {
  let at = 1000;
  t.mock.method(Date, 'now', () => at);
  const otherId = 'buffalo-reddy';
  const other = CITY_BY_ID.get(otherId);
  const probe = setup(async (url) => {
    if (url === other.stationStatusUrl) throw new Error('other city outage');
    return status();
  });
  probe.state._activeCityIds.add(otherId);
  await Promise.allSettled([
    probe.ingestion.loadCityStationStatus(cityId, 1),
    probe.ingestion.loadCityStationStatus(otherId, 1),
  ]);
  at = 2000;
  await probe.ingestion.loadCityStationStatus(cityId, 1);
  const rows = new Map(
    probe.stats().cityAcquisitionHealth.map((row) => [row.cityId, row]),
  );
  assert.equal(rows.get(cityId).status.lastAccepted, 2000);
  assert.equal(rows.get(otherId).status.outcome, 'failed');
  assert.equal(rows.get(otherId).status.lastCompletion, 1000);
  assert.equal(rows.get(otherId).status.lastAccepted, null);
});
