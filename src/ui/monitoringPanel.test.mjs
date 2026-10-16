import test from 'node:test';
import assert from 'node:assert/strict';
import { railFixture } from './railTestFixture.mjs';
import { createMonitoringPanel } from './monitoringPanel.js';

/** Extend the existing instrumented rail DOM only with the data selectors used here. */
function harness() {
  const f = railFixture();
  const original = f.document.createElement;
  f.document.createElement = (tag) => {
    const node = original(tag);
    const matches = node.matches;
    node.matches = (selector) => {
      const attr = /^\[data-([a-z-]+)\]$/.exec(selector);
      if (attr)
        return (
          node.dataset[
            attr[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())
          ] != null
        );
      return matches.call(node, selector);
    };
    return node;
  };
  const body = f.document.createElement('body');
  f.document.body = body;
  const anchor = f.document.createElement('nav');
  body.append(anchor);
  let dataListener, mapListener, activeFilter;
  let state = {
    feedState: 'nominal',
    count: 2,
    lastUpdate: Date.now(),
    rows: [
      {
        stableId: 'a',
        mag: 4,
        lat: 20,
        lon: 175,
        time: Date.now() - 1000,
        place: 'East',
        url: 'https://earthquake.usgs.gov/earthquakes/eventpage/a',
      },
      {
        stableId: 'b',
        mag: 3,
        lat: 20,
        lon: -30,
        time: Date.now() - 2000,
        place: 'West',
      },
    ],
  };
  const mapSelections = [];
  const focused = [];
  let requests = 0;
  const searches = [];
  const controller = createMonitoringPanel({
    document: f.document,
    anchor,
    readEarthquakes: () => state,
    subscribeEarthquakes(fn) {
      dataListener = fn;
      return () => {
        dataListener = null;
      };
    },
    subscribeMapSelection(fn) {
      mapListener = fn;
      return () => {
        mapListener = null;
      };
    },
    selectMapEvent(id) {
      mapSelections.push(id);
    },
    applyMapFilter(fn) {
      activeFilter = fn;
    },
    focusEvent: (event) => focused.push(event.id),
    readMapArea: () => ({
      point: { lat: 20, lon: 175 },
      bounds: { west: 170, east: -170, south: 10, north: 30 },
    }),
    enableEarthquakes: async () => {},
    newsService: {
      async searchNews(query) {
        searches.push(query);
        return {
          status: 'ready',
          newsStatus: 'ready',
          newsSource: 'GDELT',
          newsQuery: 'Topic fixture',
          retrievedAt: new Date().toISOString(),
          articles: [
            {
              title: 'Diplomacy fixture',
              domain: 'Topic publisher',
              url: 'https://publisher.example/topic',
              publishedAt: null,
            },
          ],
        };
      },
      async getBrief() {
        requests++;
        return {
          status: 'ready',
          newsStatus: 'ready',
          newsSource: 'Google News RSS',
          retrievedAt: new Date().toISOString(),
          newsQuery: 'Test region',
          articles: [
            {
              title: '<script>Unsafe-looking headline is text</script>',
              domain: 'Publisher',
              url: 'https://news.google.com/rss/articles/test',
              publishedAt: null,
            },
          ],
        };
      },
    },
  });
  const find = (predicate) => f.find(predicate, body);
  return {
    controller,
    body,
    find,
    mapSelections,
    focused,
    searches,
    button: (text) =>
      find((n) => n.tagName === 'BUTTON' && n.textContent === text),
    filter: (name, value) => {
      const input = find((n) => n.dataset.filter === name);
      input.value = value;
      input.dispatchEvent(new Event('change'));
    },
    rows: () => {
      const list = find((n) => n.className?.includes('monitoring-list'));
      return list.children;
    },
    selectMap: (id) => mapListener(id),
    refresh(rows) {
      state = { ...state, rows, count: rows.length };
      dataListener();
    },
    get dataListener() {
      return dataListener;
    },
    get mapListener() {
      return mapListener;
    },
    get activeFilter() {
      return activeFilter;
    },
    get requests() {
      return requests;
    },
  };
}

test('opt-in controller shares map/list/details selection, filters maps, resets, expires records and releases resources', () => {
  const h = harness();
  try {
    assert.equal(h.activeFilter, undefined);
    h.button('MONITOR').click();
    assert.equal(h.rows().length, 2);
    h.selectMap('a');
    assert.match(
      h.find((n) => n.className?.includes('rail-card-title')).textContent,
      /East/,
    );
    assert.equal(h.rows()[0].children[0].getAttribute('aria-pressed'), 'true');
    h.rows()[1].children[0].click();
    assert.equal(h.mapSelections.at(-1), 'b');
    h.button('Use map bounds').click();
    assert.equal(h.rows().length, 1);
    assert.equal(
      h.activeFilter({
        stableId: 'a',
        mag: 4,
        lat: 20,
        lon: 175,
        time: Date.now(),
      }),
      true,
    );
    assert.equal(
      h.activeFilter({
        stableId: 'b',
        mag: 4,
        lat: 20,
        lon: -30,
        time: Date.now(),
      }),
      false,
    );
    h.button('Reset filters').click();
    assert.equal(h.rows().length, 2);
    h.selectMap('a');
    h.refresh([]);
    assert.match(
      h.find((n) => n.dataset.lineId === '0').textContent,
      /no longer/,
    );
    h.button('Close').click();
    assert.equal(h.activeFilter, null);
    assert.equal(h.find((n) => n.id === 'monitoring-panel').hidden, true);
    assert.equal(h.requests, 0, 'opening/closing does not request news');
  } finally {
    h.controller.destroy();
  }
  assert.equal(h.dataListener, null);
  assert.equal(h.mapListener, null);
  assert.equal(
    h.body.children.length,
    1,
    'panel and opener removed; navigation container retained',
  );
});
test('regional report details remain unlocated, retain source links, and never request map focus', async () => {
  const h = harness();
  try {
    h.button('MONITOR').click();
    h.button('News at map center').click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.requests, 1);
    const healthDetail = h.find(
      (n) => n.className === 'monitoring-source-detail',
    ).textContent;
    assert.match(healthDetail, /News attempt .*accepted/);
    assert.match(healthDetail, /News accepted /);
    assert.match(healthDetail, /News source snapshot /);
    assert.match(healthDetail, /News cooldown \(request spacing\)/);
    h.filter('category', 'report');
    assert.equal(h.rows().length, 1);
    h.rows()[0].children[0].click();
    assert.equal(h.mapSelections.at(-1), null);
    assert.match(
      h.find((n) => n.className?.includes('rail-card-title')).textContent,
      /<script>/,
    );
    assert.ok(
      h.find((n) => n.dataset.lineId && /Unlocated report/.test(n.textContent)),
    );
    assert.equal(h.button('Locate on map'), null);
    const source = h.find((n) => n.tagName === 'A');
    assert.equal(source.href, 'https://news.google.com/rss/articles/test');
    assert.equal(source.target, '_blank');
    assert.match(source.rel, /noopener/);
    assert.deepEqual(h.focused, []);
    h.button('Close').click();
    assert.equal(h.activeFilter, null);
  } finally {
    h.controller.destroy();
  }
});

test('explicit topic search and loaded keyword/publisher filtering use one shared cohort without extra acquisition', async () => {
  const h = harness();
  try {
    h.button('MONITOR').click();
    assert.equal(h.searches.length, 0);
    h.find((n) => n.dataset.newsQuery === 'topic').value = 'diplomacy';
    h.find((n) => n.dataset.newsQuery === 'provider').value = 'gdelt';
    h.find((n) => n.dataset.newsQuery === 'region').value = 'Belgium';
    h.find((n) => n.tagName === 'FORM').dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await new Promise((done) => setImmediate(done));
    assert.equal(h.searches.length, 1);
    assert.equal(h.searches[0].topic, 'diplomacy');
    assert.equal(h.searches[0].region, 'Belgium');
    assert.equal(h.rows().length, 3);
    h.filter('publisher', 'Topic publisher');
    assert.equal(h.rows().length, 1);
    const keyword = h.find((n) => n.dataset.filter === 'keyword');
    keyword.value = 'missing';
    keyword.dispatchEvent(new Event('input'));
    assert.equal(h.rows().length, 0);
    h.button('Reset filters').click();
    assert.equal(h.rows().length, 3);
    assert.equal(keyword.value, '');
    assert.equal(h.searches.length, 1, 'loaded filters do not fetch');
  } finally {
    h.controller.destroy();
  }
});
