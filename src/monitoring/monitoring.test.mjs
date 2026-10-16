import test from 'node:test';
import assert from 'node:assert/strict';
import {
  earthquakeEvent,
  newsEvents,
  eventTime,
  reportLinkKey,
  groupNewsReports,
} from './events.js';
import {
  createMonitoringStore,
  defaultFilters,
  eventMatches,
} from './store.js';
import { createMonitoringNews } from './news.js';
import { normalizeEarthquakeSnapshot } from '../layers/earthquakes/records.js';

const NOW = Date.UTC(2026, 9, 15, 12);
const report = (url = 'https://publisher.example/report') => ({
  status: 'ready',
  newsStatus: 'ready',
  newsSource: 'Google News RSS',
  retrievedAt: new Date(NOW).toISOString(),
  place: { label: 'Brussels' },
  articles: [
    { title: 'A report', url, publishedAt: null, domain: 'Publisher' },
  ],
});
const quake = { stableId: 'one', mag: 4, lat: 20, lon: 175, time: NOW - 1000 };

test('nullable report metadata never turns query coordinates or retrieval time into evidence', () => {
  const payload = { ...report(), coordinates: { latitude: 50, longitude: 4 } };
  const [event] = newsEvents(payload);
  assert.equal(event.coordinates, null);
  assert.equal(event.timeMs, null);
  assert.equal(event.originalUrl, null);
  assert.equal(event.queryContext, 'Brussels');
  assert.match(event.kind, /not independently corroborated/);
  assert.match(event.locationEvidence, /Unlocated/);
  assert.equal(eventTime('2026-99-99'), null);
  assert.equal(eventTime(Infinity), null);
  assert.equal(eventTime(null), null);
});
test('news IDs survive changing headlines; URL duplicates collapse and unsafe links are refused', () => {
  const first = newsEvents(report())[0];
  const changed = report();
  changed.articles[0].title = 'Updated';
  assert.equal(newsEvents(changed)[0].id, first.id);
  changed.articles.push(changed.articles[0], {
    title: 'Bad',
    url: 'javascript:alert(1)',
  });
  assert.equal(newsEvents(changed).length, 1);
  changed.newsSource = 'GDELT fallback';
  assert.equal(newsEvents(changed)[0].timeMeaning, 'Indexed (GDELT)');
});
test('shared filters combine categories, time, source and antimeridian bounds with explicit unknown policies', () => {
  const event = earthquakeEvent(quake);
  const filters = {
    ...defaultFilters(),
    bounds: { west: 170, east: -170, south: 10, north: 30 },
  };
  assert.equal(eventMatches(event, filters, NOW), true);
  assert.equal(
    eventMatches(
      { ...event, coordinates: { lat: 20, lon: -175 } },
      filters,
      NOW,
    ),
    true,
  );
  assert.equal(
    eventMatches({ ...event, coordinates: { lat: 20, lon: 0 } }, filters, NOW),
    false,
  );
  assert.equal(
    eventMatches({ ...event, timeMs: NOW - 25 * 3600000 }, filters, NOW),
    false,
  );
  assert.equal(
    eventMatches({ ...event, timeMs: NOW + 1 }, filters, NOW),
    false,
  );
  const news = newsEvents(report())[0];
  assert.equal(eventMatches(news, filters, NOW), true);
  assert.equal(
    eventMatches(news, { ...filters, includeUnlocated: false }, NOW),
    false,
  );
  assert.equal(
    eventMatches(news, { ...filters, includeUnknownTime: false }, NOW),
    false,
  );
  assert.equal(
    eventMatches(event, { ...filters, source: 'Other' }, NOW),
    false,
  );
  assert.equal(
    eventMatches(event, { ...filters, category: 'report' }, NOW),
    false,
  );
});
test('selection survives refresh by stable identity, expires on removal and clears when filtered; reset restores cohort', () => {
  const store = createMonitoringStore({ now: () => NOW });
  const event = earthquakeEvent(quake);
  store.replace('earthquakes', [event]);
  store.select(event.id);
  store.replace('earthquakes', [{ ...event, title: 'Revised' }]);
  assert.equal(store.snapshot().selected.title, 'Revised');
  store.filter({ category: 'report' });
  assert.equal(store.snapshot().selectedId, null);
  assert.match(store.snapshot().selectionNotice, /filters/);
  store.reset();
  store.select(event.id);
  store.replace('earthquakes', []);
  assert.match(store.snapshot().selectionNotice, /no longer/);
  store.destroy();
});
test('missing upstream IDs use content-stable identity rather than feed order', () => {
  const a = {
    geometry: { type: 'Point', coordinates: [2, 3, 4] },
    properties: { mag: 4, time: NOW },
  };
  const b = {
    geometry: { type: 'Point', coordinates: [4, 5, 6] },
    properties: { mag: 5, time: NOW - 1 },
  };
  const first = normalizeEarthquakeSnapshot({ features: [a, b] });
  const second = normalizeEarthquakeSnapshot({ features: [b, a] });
  assert.equal(first[0].stableId, second[1].stableId);
});
test('superseded, cancelled and destroyed news responses cannot publish, even if transport ignores abort', async () => {
  const pending = [];
  const states = [];
  const client = createMonitoringNews({
    now: () => NOW,
    publish: (s) => states.push(s),
    service: {
      getBrief(lat, lon, { signal }) {
        return new Promise((resolve) => pending.push({ resolve, signal }));
      },
    },
  });
  const first = client.load({ lat: 1, lon: 1 });
  const second = client.load({ lat: 2, lon: 2 });
  assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve(report());
  await second;
  pending[0].resolve(report('https://old.example/'));
  await first;
  assert.equal(
    states.at(-1).rows[0].sourceUrl,
    'https://publisher.example/report',
  );
  client.destroy();
  const count = states.length;
  await client.load({ lat: 3, lon: 3 });
  assert.equal(states.length, count);
  const late = [];
  const cancelled = createMonitoringNews({
    publish: (s) => late.push(s),
    service: {
      getBrief() {
        return new Promise((resolve) => pending.push({ resolve }));
      },
    },
  });
  const promise = cancelled.load({ lat: 3, lon: 3 });
  cancelled.cancel();
  pending.at(-1).resolve(report());
  await promise;
  assert.equal(late.at(-1).status, 'disabled');
  assert.equal(late.at(-1).rows.length, 0);
  cancelled.destroy();
});
test('news clears old-region rows, treats valid empty as healthy empty, and honors failure cooldown', async () => {
  let now = NOW;
  let calls = 0;
  let result = report();
  const states = [];
  const client = createMonitoringNews({
    now: () => now,
    publish: (s) => states.push(s),
    service: {
      async getBrief() {
        calls++;
        if (result instanceof Error) throw result;
        return result;
      },
    },
  });
  await client.load({ lat: 1, lon: 1 });
  result = Object.assign(new Error('limited'), {
    status: 429,
    retryAfterMs: 60000,
  });
  now += 6000;
  await client.load({ lat: 1, lon: 1 });
  assert.equal(states.at(-1).status, 'stale');
  assert.match(states.at(-1).error, /rate limited/);
  await client.load({ lat: 2, lon: 2 });
  assert.equal(calls, 2);
  now += 61000;
  result = { ...report(), articles: [], newsStatus: 'empty' };
  const before = states.length;
  await client.load({ lat: 2, lon: 2 });
  assert.equal(states[before].rows.length, 0);
  assert.equal(states.at(-1).status, 'empty');
  client.destroy();
});

test('loaded keyword and publisher filters apply without interpreting headlines as corroboration', () => {
  const [event] = newsEvents(report());
  assert.equal(
    eventMatches(
      event,
      { ...defaultFilters(), keyword: 'REPORT', publisher: 'Publisher' },
      NOW,
    ),
    true,
  );
  assert.equal(
    eventMatches(event, { ...defaultFilters(), publisher: 'Other' }, NOW),
    false,
  );
  assert.equal(
    eventMatches(
      earthquakeEvent(quake),
      { ...defaultFilters(), publisher: 'Publisher' },
      NOW,
    ),
    false,
  );
  assert.equal(
    eventMatches(event, { ...defaultFilters(), keyword: 'ceasefire' }, NOW),
    false,
  );
});
test('topic query completion cannot replace a newer region request and partial provider outcomes are disclosed', async () => {
  const pending = [];
  const states = [];
  const client = createMonitoringNews({
    now: () => NOW,
    publish: (s) => states.push(s),
    service: {
      searchNews: () => new Promise((resolve) => pending.push(resolve)),
      getBrief: async () => ({ ...report(), status: 'partial' }),
    },
  });
  const topic = client.search({ topic: 'conflict' });
  await client.load({ lat: 1, lon: 1 });
  pending[0](report('https://superseded.example/'));
  await topic;
  assert.equal(states.at(-1).status, 'degraded');
  assert.equal(
    states.at(-1).rows[0].sourceUrl,
    'https://publisher.example/report',
  );
  client.destroy();
});

test('news health distinguishes request time, accepted fallback age and cooldown without extra requests', async () => {
  let now = NOW;
  let payload = {
    ...report(),
    retrievedAt: new Date(NOW - 3600000).toISOString(),
    status: 'stale',
  };
  let calls = 0;
  let latest;
  const client = createMonitoringNews({
    now: () => now,
    publish: (state) => {
      latest = state;
    },
    service: {
      async getBrief() {
        calls++;
        if (payload instanceof Error) throw payload;
        return payload;
      },
    },
  });
  await client.load({ lat: 1, lon: 1 });
  assert.equal(latest.lastAttempt, NOW);
  assert.equal(latest.lastAcceptedAt, NOW);
  assert.equal(latest.lastOutcome, 'stale');
  assert.equal(
    latest.lastSuccess,
    payload.retrievedAt,
    'fallback retains source acquisition age',
  );
  assert.equal(latest.retryReason, 'request spacing');
  now += 1000;
  await client.load({ lat: 1, lon: 1 });
  assert.equal(calls, 1);
  assert.equal(
    latest.lastAttempt,
    NOW,
    'cooldown is not an acquisition attempt',
  );
  now += 6000;
  payload = Object.assign(new Error('fixture'), {
    status: 429,
    retryAfterMs: 60000,
  });
  await client.load({ lat: 1, lon: 1 });
  assert.equal(latest.lastAttempt, now);
  assert.equal(latest.lastAcceptedAt, NOW);
  assert.equal(latest.lastOutcome, 'failed');
  assert.equal(latest.retryReason, 'rate limit');
  assert.equal(latest.retryAt, now + 60000);
  client.destroy();
});

test('link provenance stays explicit and grouping keys preserve material URL parameters', () => {
  assert.equal(
    reportLinkKey(
      'https://example.com/a?edition=en&utm_source=rss&fbclid=x#section',
    ),
    'https://example.com/a?edition=en',
  );
  assert.notEqual(
    reportLinkKey('https://example.com/a?id=1'),
    reportLinkKey('https://example.com/a?id=2'),
  );
  assert.equal(reportLinkKey('https://user:password@example.com/a'), null);
  assert.equal(
    newsEvents(report('https://user:password@example.com/a')).length,
    0,
  );
  const indexed = {
    ...report('https://news.google.com/rss/articles/opaque'),
    newsSource: 'GDELT',
  };
  assert.equal(newsEvents(indexed)[0].originalUrl, null);
  assert.equal(newsEvents(indexed)[0].linkKind, 'aggregator');
  indexed.articles[0].url =
    'https://publisher.example/article?utm_source=gdelt';
  const [row] = newsEvents(indexed);
  assert.equal(row.linkKind, 'provider-reported');
  assert.equal(row.linkHost, 'publisher.example');
  assert.equal(
    row.sourceUrl,
    indexed.articles[0].url,
    'opening preserves provider URL',
  );
});

test('report grouping retains every row and uses exact URLs or long matching timed headlines', () => {
  const title =
    'Diplomats announce further negotiations following international security summit';
  const make = (id, url, timeMs = NOW, headline = title) => ({
    id,
    sourceUrl: url,
    title: headline,
    timeMs,
    category: 'report',
    source: 'Google News RSS',
    publisher: id,
  });
  const rows = [
    make('a', 'https://a.example/story?utm_source=rss', NOW, title + ' - a'),
    make('b', 'https://b.example/story', NOW + 1000, title + ' - b'),
    make(
      'c',
      'https://a.example/story?utm_source=social',
      null,
      'A changed article headline',
    ),
    make('d', 'https://d.example/story', NOW + 2 * 86400000),
    make('e', 'https://e.example/story', null),
    { id: 'quake', category: 'earthquake', title },
  ];
  const groups = groupNewsReports(rows);
  assert.equal(groups.flatMap((group) => group.members).length, 5);
  const sameLink = groups.find((group) =>
    group.members.some((row) => row.id === 'c'),
  );
  assert.deepEqual(
    sameLink.members.map((row) => row.id),
    ['a', 'c'],
  );
  assert.match(sameLink.reason, /normalized URL/);
  // Differing headlines in the URL group prevent transitive headline grouping.
  assert.equal(groups.length, 4);
  const headlines = groupNewsReports(rows.filter((row) => row.id !== 'c'));
  assert.deepEqual(
    headlines[0].members.map((row) => row.id),
    ['a', 'b'],
  );
  assert.match(headlines[0].reason, /headline within 24 hours/);
  assert.equal(
    groupNewsReports([
      make('x', 'https://x.example/', NOW, 'Brief title'),
      make('y', 'https://y.example/', NOW, 'Brief title'),
    ]).length,
    2,
  );
  assert.deepEqual(
    groupNewsReports([...rows].reverse()),
    groups,
    'input order does not change grouping',
  );
});

test('headline groups never span more than 24 hours or merge distinct numbers and negation', () => {
  const title =
    'Government confirms agreement after negotiations with international representatives';
  const rows = [0, 23, 46].map((hour, index) => ({
    id: String(index),
    category: 'report',
    title,
    sourceUrl: `https://example.com/${index}`,
    timeMs: NOW + hour * 3600000,
  }));
  const groups = groupNewsReports(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].members.length, 2);
  const variants = [
    title,
    title.replace('confirms', 'does not confirm'),
    title + ' 2',
  ].map((headline, index) => ({
    ...rows[0],
    id: String(index),
    title: headline,
    sourceUrl: `https://other.example/${index}`,
  }));
  assert.equal(groupNewsReports(variants).length, 3);
});

test('configured RSS keeps publication provenance and never assigns query geography', () => {
  const payload = {
    ...report(),
    newsSource: 'Configured RSS · World feed',
    newsTimeMeaning: 'Publication (RSS)',
    newsQuery: 'RSS World feed · topic not applied',
  };
  const [event] = newsEvents(payload);
  assert.equal(event.timeMeaning, 'Publication (RSS)');
  assert.equal(event.linkKind, 'provider-reported');
  assert.equal(event.coordinates, null);
  assert.match(event.kind, /not independently corroborated/);
});

test('news client bounds configured feed freshness without restamping cached acquisition', async () => {
  let state;
  let freshness = 900000;
  const client = createMonitoringNews({
    now: () => NOW,
    publish: (value) => {
      state = value;
    },
    service: {
      getBrief: async () => ({ ...report(), newsFreshForMs: freshness }),
    },
  });
  await client.load({ lat: 1, lon: 1 });
  assert.equal(state.freshnessMs, 900000);
  assert.equal(state.lastSuccess, report().retrievedAt);
  client.destroy();
  freshness = Infinity;
  const invalid = createMonitoringNews({
    now: () => NOW,
    publish: (value) => {
      state = value;
    },
    service: {
      getBrief: async () => ({ ...report(), newsFreshForMs: freshness }),
    },
  });
  await invalid.load({ lat: 1, lon: 1 });
  assert.equal(state.freshnessMs, 300000);
  invalid.destroy();
});

test('Atom per-entry publication/update semantics survive projection without turning updates into publication', () => {
  for (const meaning of [
    'Publication (Atom)',
    'Update (Atom)',
    'Publication/update (Atom)',
  ]) {
    const payload = {
      ...report(),
      newsSource: 'Configured Atom · World feed',
      newsTimeMeaning: 'Publication/update (Atom)',
    };
    payload.articles[0].timestampMeaning = meaning;
    const [row] = newsEvents(payload);
    assert.equal(row.timeMeaning, meaning);
    assert.equal(row.coordinates, null);
  }
});
