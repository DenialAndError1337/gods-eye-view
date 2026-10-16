import test from 'node:test';
import assert from 'node:assert/strict';
import {
  monitoringNewsProxy,
  fetchMonitoringNews,
  normalizeMonitoringArticles,
} from './monitoringNews.js';
import {
  monitoringNewsQuery,
  newsSearchExpression,
} from '../../src/monitoring/newsQuery.js';
const NOW = Date.UTC(2026, 9, 15, 12);
const query = (text = '') => monitoringNewsQuery(new URLSearchParams(text));
const article = {
  title: 'Report',
  url: 'https://publisher.example/a',
  publishedAt: new Date(NOW - 1000).toISOString(),
  domain: 'Publisher',
};
function harness(options) {
  let handler;
  const plugin = monitoringNewsProxy(options);
  plugin.configureServer({
    middlewares: {
      use(path, callback) {
        if (path === '/api/monitoring-news') handler = callback;
      },
    },
  });
  return async (search = '', method = 'GET') => {
    const result = {};
    const req = {
      method,
      url: `/?${search}`,
      socket: { remoteAddress: 'fixture' },
    };
    const res = {
      writeHead(code, headers) {
        result.code = code;
        result.headers = headers;
      },
      end(body) {
        result.payload = JSON.parse(body);
      },
    };
    await handler(req, res);
    return result;
  };
}
test('queries are bounded, whitelist providers/topics/windows and quote plain user text', () => {
  for (const value of [
    'topic=unknown',
    'provider=http://127.0.0.1',
    'hours=2',
    'topic=security&topic=conflict',
    'url=https://example.org',
    `keywords=${'x'.repeat(121)}`,
  ])
    assert.equal(query(value), null, value);
  const q = query(
    'topic=diplomacy&keywords=peace%22%20OR%20site%3Aevil&region=Belgium',
  );
  const expression = newsSearchExpression(q);
  assert.match(expression, /"peace OR site evil"/);
  assert.match(expression, /"Belgium"/);
  assert.doesNotMatch(expression, /site:/);
});
test('acquisition uses fixed hosts, preserves regional limits, and identifies direct versus fallback GDELT', async () => {
  const urls = [];
  const options = {
    text: async (url) => {
      urls.push(url);
      return '<rss><channel></channel></rss>';
    },
    json: async (url) => {
      urls.push(url);
      return { articles: [{ ...article, seendate: '20261015T115959Z' }] };
    },
  };
  const result = await fetchMonitoringNews(query(), options);
  assert.equal(result.source, 'GDELT fallback');
  assert.equal(result.articles.length, 1);
  assert.equal(new URL(urls[0]).hostname, 'news.google.com');
  assert.equal(new URL(urls[1]).hostname, 'api.gdeltproject.org');
  assert.equal(
    (await fetchMonitoringNews(query('provider=gdelt'), options)).source,
    'GDELT',
  );
  const payload = {
    articles: Array.from({ length: 50 }, (_, i) => ({
      ...article,
      url: `https://publisher.example/${i}`,
      seendate: '20261015T115959Z',
    })),
  };
  assert.equal(normalizeMonitoringArticles(payload).length, 25);
  assert.throws(
    () => normalizeMonitoringArticles({ error: 'bad' }),
    /Malformed/,
  );
  assert.equal(
    normalizeMonitoringArticles({
      articles: [
        { ...article, url: 'javascript:bad()' },
        { ...article, seendate: '20261015T115959Z' },
        { ...article, seendate: '20261015T115959Z' },
      ],
    }).length,
    1,
  );
});
test('malformed RSS is unavailable; valid empty stays distinguishable when fallback fails', async () => {
  await assert.rejects(
    fetchMonitoringNews(query('provider=google'), {
      text: async () => '<html>error</html>',
    }),
    /unavailable/,
  );
  const result = await fetchMonitoringNews(query(), {
    text: async () => '<rss></rss>',
    json: async () => {
      throw new Error('offline');
    },
  });
  assert.deepEqual(result, {
    articles: [],
    source: 'Google News RSS',
    partial: true,
  });
});
test('endpoint validates before acquisition, coalesces, caches, and throttles distinct queries', async () => {
  let calls = 0,
    resolve;
  const request = harness({
    now: () => NOW,
    fetchNews: () => {
      calls++;
      return new Promise((done) => {
        resolve = done;
      });
    },
  });
  assert.equal((await request('topic=bad')).code, 400);
  assert.equal((await request('', 'POST')).code, 405);
  assert.equal(calls, 0);
  const a = request();
  const b = request();
  await new Promise((done) => setImmediate(done));
  assert.equal(calls, 1);
  assert.equal((await request('topic=security')).code, 429);
  resolve({ articles: [article], source: 'Google News RSS' });
  assert.equal((await a).code, 200);
  assert.equal((await b).code, 200);
  const cached = await request();
  assert.equal(cached.payload.cache, 'hit');
  assert.equal(calls, 1);
});
test('endpoint retains last success on outage, expires stale data, filters supplied dates, and accepts zero results', async () => {
  let now = NOW,
    fail = false;
  const request = harness({
    now: () => now,
    fetchNews: async () => {
      if (fail) throw new Error('internal private failure');
      return {
        source: 'Google News RSS',
        articles: [
          article,
          {
            ...article,
            url: 'https://publisher.example/old',
            publishedAt: new Date(NOW - 49 * 3600000).toISOString(),
          },
        ],
      };
    },
  });
  const initial = await request();
  assert.equal(initial.payload.articles.length, 1);
  now += 300001;
  fail = true;
  const stale = await request();
  assert.equal(stale.payload.status, 'stale');
  assert.equal(stale.payload.retrievedAt, initial.payload.retrievedAt);
  now += 3600000;
  const down = await request();
  assert.equal(down.code, 503);
  assert.doesNotMatch(JSON.stringify(down.payload), /private/);
  const empty = harness({
    now: () => now,
    fetchNews: async () => ({ source: 'GDELT', articles: [] }),
  });
  const result = await empty();
  assert.equal(result.code, 200);
  assert.equal(result.payload.newsStatus, 'empty');
});
