import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import {
  configuredNewsFeeds,
  readConfiguredNewsFeed,
  configuredFeedReader,
  fetchConfiguredNews,
} from './monitoringFeeds.js';
import { monitoringNewsProxy } from './monitoringNews.js';
const NOW = Date.UTC(2026, 9, 16, 12);
const raw = {
  id: 'world',
  label: 'World feed',
  url: 'https://feeds.publisher.org/world.xml',
  refreshMinutes: 5,
};
const feed = configuredNewsFeeds([raw])[0];
const xml = (title = 'Belgium diplomacy report') =>
  `<rss version="2.0"><channel><item><title>${title}</title><link>https://publisher.example/article</link><pubDate>${new Date(NOW - 1000).toUTCString()}</pubDate></item></channel></rss>`;
const publicAddresses = [{ address: '93.184.216.34', family: 4 }];

test('operator inventory confines identifiers, HTTPS destinations, refresh bounds and size', () => {
  assert.deepEqual(configuredNewsFeeds(), []);
  assert.equal(configuredNewsFeeds(JSON.stringify([raw]))[0].refreshMinutes, 5);
  for (const rows of [
    Array(9).fill(raw),
    [raw, raw],
    [{ ...raw, id: '../bad' }],
    [{ ...raw, refreshMinutes: 1 }],
    [{ ...raw, refreshMinutes: 1441 }],
    [{ ...raw, label: '' }],
  ])
    assert.throws(() => configuredNewsFeeds(rows));
  for (const url of [
    'http://feeds.publisher.org/rss',
    'https://localhost/rss',
    'https://127.0.0.1/rss',
    'https://[::1]/rss',
    'https://2130706433/rss',
    'https://feeds.publisher.org:444/rss',
    'https://user:pass@feeds.publisher.org/rss',
    'https://feeds.publisher.org/rss#fragment',
  ])
    assert.throws(() => configuredNewsFeeds([{ ...raw, url }]));
});

test('RSS transport pins validated public DNS addresses in the actual HTTPS request', async (t) => {
  let seen;
  t.mock.method(https, 'request', (url, options, callback) => {
    assert.equal(url.href, raw.url);
    seen = options;
    const request = new EventEmitter();
    request.end = () => {
      const response = Readable.from([Buffer.from(xml())]);
      response.statusCode = 200;
      response.headers = { 'content-type': 'application/rss+xml' };
      callback(response);
    };
    return request;
  });
  assert.match(
    await readConfiguredNewsFeed(feed, {
      lookupImpl: async () => publicAddresses,
    }),
    /Belgium/,
  );
  seen.lookup('ignored', {}, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, publicAddresses[0].address);
    assert.equal(family, 4);
  });
  seen.lookup('ignored', { all: true }, (error, addresses) => {
    assert.equal(error, null);
    assert.deepEqual(addresses, publicAddresses);
  });
});

test('RSS transport refuses nonpublic/mixed DNS, redirects, oversized bodies and full-request timeouts', async () => {
  let calls = 0;
  for (const addresses of [
    [{ address: '127.0.0.1', family: 4 }],
    [...publicAddresses, { address: '10.0.0.1', family: 4 }],
    [{ address: '::1', family: 6 }],
    [],
  ]) {
    await assert.rejects(
      readConfiguredNewsFeed(feed, {
        lookupImpl: async () => addresses,
        requestImpl: async () => {
          calls++;
        },
      }),
    );
  }
  assert.equal(calls, 0);
  await assert.rejects(
    readConfiguredNewsFeed(feed, {
      lookupImpl: async () => publicAddresses,
      requestImpl: async () =>
        new Response('', {
          status: 302,
          headers: { Location: 'http://127.0.0.1' },
        }),
    }),
  );
  await assert.rejects(
    readConfiguredNewsFeed(feed, {
      lookupImpl: async () => publicAddresses,
      requestImpl: async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)),
    }),
  );
  await assert.rejects(
    readConfiguredNewsFeed(feed, {
      lookupImpl: () => new Promise(() => {}),
      timeoutMs: 5,
    }),
    /timed out/,
  );
});

test('per-feed reader coalesces, shares cache across queries, retains source time and spaces failed retries', async () => {
  let now = NOW;
  let calls = 0;
  let fail = false;
  const reader = configuredFeedReader({
    now: () => now,
    readFeed: async () => {
      calls++;
      if (fail) throw Error('fixture');
      return xml();
    },
  });
  const [a, b] = await Promise.all([reader(feed), reader(feed)]);
  assert.equal(calls, 1);
  assert.equal(a.fetchedAt, b.fetchedAt);
  const query = {
    provider: 'rss:world',
    keywords: 'Belgium',
    region: '',
    hours: 24,
  };
  const result = await fetchConfiguredNews(query, [feed], reader, () => now);
  assert.equal(result.articles.length, 1);
  assert.equal(result.timeMeaning, 'Publication (RSS)');
  assert.match(result.queryLabel, /topic not applied/);
  assert.equal(
    (
      await fetchConfiguredNews(
        { ...query, keywords: 'missing' },
        [feed],
        reader,
        () => now,
      )
    ).articles.length,
    0,
  );
  assert.equal(calls, 1);
  now += 300001;
  fail = true;
  const stale = await reader(feed);
  assert.equal(stale.stale, true);
  assert.equal(stale.fetchedAt, NOW);
  await reader(feed);
  assert.equal(calls, 2);
  now += 4000000;
  await assert.rejects(reader(feed));
  assert.equal(calls, 3);
});

test('malformed and unsupported feeds cannot become valid empty snapshots', async () => {
  for (const body of [
    '<html></html>',
    '<feed></feed>',
    '<rss><channel><item></channel></rss>',
    '<!DOCTYPE rss><rss><channel></channel></rss>',
  ]) {
    await assert.rejects(
      configuredFeedReader({ readFeed: async () => body })(feed),
    );
  }
  const empty = configuredFeedReader({
    readFeed: async () => '<rss><channel></channel></rss>',
    now: () => NOW,
  });
  assert.equal(
    (
      await fetchConfiguredNews(
        { provider: 'rss:world', keywords: '', region: '', hours: 24 },
        [feed],
        empty,
        () => NOW,
      )
    ).articles.length,
    0,
  );
});

test('source inventory publishes no destination secrets; endpoint accepts only configured IDs and keeps built-ins isolated', async () => {
  const handlers = new Map();
  let calls = 0;
  let now = NOW;
  monitoringNewsProxy({
    now: () => now,
    feeds: [{ ...raw, url: raw.url + '?token=private-value' }],
    readFeed: async () => {
      calls++;
      return xml();
    },
    fetchNews: async () => ({ articles: [], source: 'GDELT' }),
  }).configureServer({
    middlewares: { use: (path, handler) => handlers.set(path, handler) },
  });
  const request = async (path, search = '') => {
    let status, body;
    await handlers.get(path)(
      {
        method: 'GET',
        url: `/?${search}`,
        socket: { remoteAddress: 'fixture' },
      },
      {
        writeHead: (code) => {
          status = code;
        },
        end: (text) => {
          body = JSON.parse(text);
        },
      },
    );
    return { status, body };
  };
  const inventory = await request('/api/monitoring-news-sources');
  assert.equal(inventory.status, 200);
  assert.equal(inventory.body.feeds.length, 1);
  assert.doesNotMatch(JSON.stringify(inventory), /private-value|world.xml/);
  assert.equal(calls, 0);
  assert.equal(
    (await request('/api/monitoring-news', 'provider=rss:unknown')).status,
    400,
  );
  assert.equal(calls, 0);
  const loaded = await request(
    '/api/monitoring-news',
    'provider=rss:world&keywords=Belgium',
  );
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.newsTimeMeaning, 'Publication (RSS)');
  assert.equal(loaded.body.articles.length, 1);
  assert.equal(calls, 1);
  now += 6000;
  const empty = await request(
    '/api/monitoring-news',
    'provider=rss:world&keywords=missing',
  );
  assert.equal(empty.body.newsStatus, 'empty');
  assert.equal(calls, 1);
});

test('invalid local inventory is isolated from built-ins and returns only a generic configuration error', async () => {
  const handlers = new Map();
  monitoringNewsProxy({
    feeds: 'invalid-secret-token',
    fetchNews: async () => ({ articles: [], source: 'GDELT' }),
  }).configurePreviewServer({
    middlewares: { use: (path, handler) => handlers.set(path, handler) },
  });
  let status, body;
  const response = {
    writeHead: (code) => {
      status = code;
    },
    end: (text) => {
      body = JSON.parse(text);
    },
  };
  await handlers.get('/api/monitoring-news-sources')(
    { method: 'GET' },
    response,
  );
  assert.equal(status, 503);
  assert.doesNotMatch(JSON.stringify(body), /invalid-secret-token/);
  await handlers.get('/api/monitoring-news')(
    {
      method: 'GET',
      url: '/?provider=gdelt',
      socket: { remoteAddress: 'fixture' },
    },
    response,
  );
  assert.equal(status, 200);
  assert.equal(body.newsStatus, 'empty');
});
