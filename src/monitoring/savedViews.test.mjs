import test from 'node:test';
import assert from 'node:assert/strict';
import { createSavedMonitoringViews, SAVED_VIEWS_KEY } from './savedViews.js';
import { defaultFilters } from './store.js';
function fixture() {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  return { data, storage, views: createSavedMonitoringViews(storage) };
}
test('explicit saved views whitelist filters, preserve antimeridian and detach stored objects', () => {
  const { data, views } = fixture();
  assert.deepEqual(views.list(), []);
  assert.equal(data.size, 0);
  const current = {
    ...defaultFilters(),
    keyword: 'diplomacy',
    bounds: { west: 170, east: -170, south: 10, north: 30 },
    query: 'secret query',
    results: ['secret'],
  };
  views.save(' Pacific ', current);
  current.bounds.west = 0;
  const loaded = views.list();
  assert.equal(loaded[0].filters.bounds.west, 170);
  assert.equal(loaded[0].name, 'Pacific');
  assert.equal('query' in loaded[0].filters, false);
  assert.equal('results' in loaded[0].filters, false);
  loaded[0].filters.bounds.west = 0;
  assert.equal(views.list()[0].filters.bounds.west, 170);
  views.save('PACIFIC', defaultFilters());
  assert.equal(views.list().length, 1);
  views.remove('PACIFIC');
  assert.deepEqual(views.list(), []);
});
test('schema, size, names, count and coordinates are bounded; unknown versions are preserved', () => {
  const { data, views } = fixture();
  for (const value of ['', 'x'.repeat(61)])
    assert.throws(() => views.save(value, defaultFilters()));
  for (const patch of [
    { hours: 999 },
    { keyword: 'x'.repeat(121) },
    { source: 'x'.repeat(201) },
    { includeUnlocated: 'true' },
    { bounds: { west: 181, east: 1, south: 0, north: 1 } },
    { bounds: { west: 0, east: 1, south: 20, north: 10 } },
    { bounds: { west: NaN, east: 1, south: 0, north: 1 } },
  ])
    assert.throws(() => views.save('bad', { ...defaultFilters(), ...patch }));
  for (let i = 0; i < 12; i++) views.save(`view ${i}`, defaultFilters());
  assert.throws(() => views.save('thirteenth', defaultFilters()));
  views.save('view 0', defaultFilters());
  for (const raw of [
    '{',
    JSON.stringify({ version: 2, views: [] }),
    'x'.repeat(17000),
    JSON.stringify({ version: 1, views: [{ name: 'bad', filters: {} }] }),
  ]) {
    data.set(SAVED_VIEWS_KEY, raw);
    assert.throws(() => views.list());
    assert.throws(() => views.save('new', defaultFilters()));
    assert.throws(() => views.remove('new'));
    assert.equal(data.get(SAVED_VIEWS_KEY), raw);
  }
});
test('writes read the latest device data and propagate unavailable/quota errors', () => {
  const { storage, views } = fixture();
  const other = createSavedMonitoringViews(storage);
  views.save('one', defaultFilters());
  other.save('two', defaultFilters());
  assert.equal(views.list().length, 2);
  storage.setItem = () => {
    throw new Error('quota');
  };
  assert.throws(() => views.save('three', defaultFilters()), /quota/);
  assert.equal(views.list().length, 2);
  assert.throws(() => createSavedMonitoringViews(null).list(), /unavailable/);
  assert.throws(
    () =>
      createSavedMonitoringViews({
        getItem() {
          throw new Error('blocked');
        },
      }).list(),
    /blocked/,
  );
});
