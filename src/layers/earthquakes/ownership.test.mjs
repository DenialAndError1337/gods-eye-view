import assert from 'node:assert/strict';
import test from 'node:test';
import { createEarthquakesLayer } from './index.js';
import { createUsgsEarthquakeSource } from './source.js';
function harness(source) {
  const sources = [];
  const events = [];
  const viewer = {
    dataSources: {
      add(value) {
        sources.push(value);
      },
      remove(value) {
        sources.splice(sources.indexOf(value), 1);
      },
    },
  };
  const layer = createEarthquakesLayer({
    source,
    overlayHost: {
      setEntries(...args) {
        events.push(args);
      },
      setVisible() {},
      clearSource() {},
    },
  });
  layer.init(viewer);
  layer.enable(viewer);
  return { layer, viewer, sources, events };
}
const row = {
  stableId: 'event-a',
  usgsId: 'event-a',
  lon: 30,
  lat: 20,
  depthKm: 3,
  mag: 4,
  place: 'Fixture',
  time: 1000,
};
test('late refresh cannot publish after disable, re-enable, or destroy', async () => {
  for (const action of ['disable', 'destroy']) {
    let resolve, signal;
    const h = harness({
      getSnapshot(options) {
        signal = options.signal;
        return new Promise((done) => {
          resolve = done;
        });
      },
    });
    const pending = h.layer.update(h.viewer);
    h.layer[action](h.viewer);
    assert.equal(signal.aborted, true);
    if (action === 'disable') h.layer.enable(h.viewer);
    resolve([row]);
    assert.equal(await pending, false);
    assert.equal(h.layer.getStats().count, 0);
    assert.equal(h.events.length, 0);
    h.layer.destroy(h.viewer);
  }
});
test('two displays own separate data sources and destruction', async () => {
  const a = harness({ getSnapshot: async () => [row] });
  const b = harness({ getSnapshot: async () => [] });
  await a.layer.update(a.viewer);
  await b.layer.update(b.viewer);
  assert.equal(a.layer.getStats().count, 1);
  assert.equal(b.layer.getStats().count, 0);
  a.layer.destroy();
  assert.equal(a.sources.length, 0);
  assert.equal(b.sources.length, 1);
  b.layer.destroy();
});
test('USGS body completion honors cancellation even with an uncooperative transport', async () => {
  const abort = new AbortController();
  const source = createUsgsEarthquakeSource({
    fetchImpl: async () => ({
      ok: true,
      json: async () => {
        abort.abort();
        return { features: [] };
      },
    }),
  });
  await assert.rejects(source.getSnapshot({ signal: abort.signal }), {
    name: 'AbortError',
  });
});

test('monitoring filters the accepted snapshot and overlay without acquisition; filter and selected identity survive refresh', async () => {
  let calls = 0;
  const h = harness({
    getSnapshot: async () => {
      calls++;
      return [row, { ...row, stableId: 'other', usgsId: 'other', lon: -30 }];
    },
  });
  await h.layer.update(h.viewer);
  h.viewer.selectedEntity = h.layer.getMonitoringEntity('event-a');
  const previous = h.viewer.selectedEntity;
  h.layer.setMonitoringFilter((record) => record.lon > 0);
  assert.equal(h.layer.getMonitoringEntity('other').show, false);
  assert.equal(h.layer.getMonitoringEntity('event-a').show, true);
  assert.deepEqual(
    h.events.at(-1)[1].map((e) => e.id),
    ['event-a'],
  );
  assert.equal(h.layer.getMonitoringRecords().length, 2);
  assert.equal(calls, 1);
  await h.layer.update(h.viewer);
  assert.notEqual(h.viewer.selectedEntity, previous);
  assert.equal(h.viewer.selectedEntity.id, 'earthquake:event-a');
  assert.equal(h.layer.getMonitoringEntity('other').show, false);
  h.layer.setMonitoringFilter(null);
  assert.equal(h.layer.getMonitoringEntity('other').show, true);
  assert.equal(calls, 2);
  h.layer.disable(h.viewer);
  assert.deepEqual(h.layer.getMonitoringRecords(), []);
  h.layer.destroy();
});

test('monitoring selection visibly distinguishes a contact, survives refresh, and releases the emphasis on close', async () => {
  const h = harness({ getSnapshot: async () => [row] });
  await h.layer.update(h.viewer);
  const baseAlpha = h.layer
    .getMonitoringEntity('event-a')
    .ellipse.material.color.getValue().alpha;
  h.layer.setMonitoringSelection('event-a');
  assert.ok(
    h.layer.getMonitoringEntity('event-a').ellipse.material.color.getValue()
      .alpha > baseAlpha,
  );
  await h.layer.update(h.viewer);
  assert.ok(
    h.layer.getMonitoringEntity('event-a').ellipse.material.color.getValue()
      .alpha > baseAlpha,
  );
  h.layer.setMonitoringFilter(null);
  assert.equal(
    h.layer.getMonitoringEntity('event-a').ellipse.material.color.getValue()
      .alpha,
    baseAlpha,
  );
  h.layer.destroy();
});
