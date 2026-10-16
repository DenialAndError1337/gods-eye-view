import {
  configuredNewsFeeds,
  fetchConfiguredNews,
  readConfiguredNewsFeed,
  configuredFeedReader,
} from './monitoringFeeds.js';
import { makeRateLimiter, clientKey } from './common/rate-limit.js';
import { fetchRegionalJson, fetchRegionalText } from './regional/http.js';
import { normalizeRssArticles } from './regional/news.js';
import { normalizeRegionalArticles } from '../../src/data/regionalModel.js';
import {
  monitoringNewsQuery,
  newsSearchExpression,
  NEWS_TOPICS,
} from '../../src/monitoring/newsQuery.js';

/** Reuse the regional normalizer without changing its five-row public contract. */
export function normalizeMonitoringArticles(payload) {
  if (!Array.isArray(payload?.articles))
    throw new Error('Malformed news response');
  const articles = [];
  const seen = new Set();
  for (const raw of payload.articles.slice(0, 250)) {
    const row = normalizeRegionalArticles({ articles: [raw] }, 1)[0];
    if (!row || seen.has(row.url)) continue;
    seen.add(row.url);
    articles.push(row);
    if (articles.length === 25) break;
  }
  return articles;
}

export async function fetchMonitoringNews(
  query,
  { text = fetchRegionalText, json = fetchRegionalJson } = {},
) {
  const expression = newsSearchExpression(query);
  let empty = null;
  if (query.provider !== 'gdelt') {
    try {
      const params = new URLSearchParams({
        q: expression,
        hl: 'en-US',
        gl: 'US',
        ceid: 'US:en',
      });
      const xml = await text(`https://news.google.com/rss/search?${params}`, {
        timeoutMs: 12000,
        headers: { 'User-Agent': 'GodsEyeView/0.1' },
      });
      if (!/<rss(?:\s|>)/i.test(xml) || !/<\/rss\s*>/i.test(xml))
        throw new Error('Malformed RSS response');
      const articles = normalizeRssArticles(xml, 25);
      const result = { articles, source: 'Google News RSS' };
      if (articles.length || query.provider === 'google') return result;
      empty = result;
    } catch {
      if (query.provider === 'google')
        throw new Error('Selected news provider unavailable');
    }
  }
  try {
    const params = new URLSearchParams({
      query: expression,
      mode: 'artlist',
      format: 'json',
      maxrecords: '25',
      sort: 'datedesc',
      timespan: `${query.hours}h`,
    });
    const payload = await json(
      `https://api.gdeltproject.org/api/v2/doc/doc?${params}`,
      {
        timeoutMs: 12000,
        redirect: 'error',
        headers: { 'User-Agent': 'GodsEyeView/0.1' },
      },
    );
    return {
      articles: normalizeMonitoringArticles(payload),
      source: query.provider === 'gdelt' ? 'GDELT' : 'GDELT fallback',
    };
  } catch {
    if (empty) return { ...empty, partial: true };
    throw new Error('Selected news providers unavailable');
  }
}

/** Bounded explicit search endpoint. Cache hits/coalescing do not acquire upstream data. */
export function monitoringNewsProxy({
  fetchNews = fetchMonitoringNews,
  now = Date.now,
  feeds: feedInput,
  readFeed = readConfiguredNewsFeed,
} = {}) {
  let feeds = [];
  let configError = false;
  const configuredReader = configuredFeedReader({ readFeed, now });
  const loadFeeds = () => {
    configError = false;
    try {
      feeds = configuredNewsFeeds(
        feedInput ?? process.env.GEV_NEWS_FEEDS ?? '',
      );
    } catch {
      feeds = [];
      configError = true;
      console.warn('[monitoring-news] Invalid configured feed inventory');
    }
  };
  const cache = new Map();
  const inflight = new Map();
  const allow = makeRateLimiter({ windowMs: 60000, max: 12, globalMax: 30 });
  let nextFetchAt = 0;
  const send = (res, code, payload, retry) => {
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(retry ? { 'Retry-After': String(retry) } : {}),
    });
    res.end(JSON.stringify(payload));
  };
  const install = (middlewares) => {
    loadFeeds();
    middlewares.use('/api/monitoring-news-sources', (req, res) => {
      if (req.method !== 'GET')
        return send(res, 405, { error: 'Method Not Allowed' });
      return configError
        ? send(res, 503, { error: 'Configured feed inventory unavailable' })
        : send(res, 200, {
            feeds: feeds.map(({ id, label, host, refreshMinutes }) => ({
              id,
              label,
              host,
              refreshMinutes,
            })),
          });
    });
    middlewares.use('/api/monitoring-news', async (req, res) => {
      if (req.method !== 'GET')
        return send(res, 405, { error: 'Method Not Allowed' });
      const query = monitoringNewsQuery(
        new URL(req.url || '', 'http://localhost').searchParams,
      );
      if (!query)
        return send(res, 400, { error: 'Invalid monitoring news query' });
      if (
        query.provider.startsWith('rss:') &&
        !feeds.some((feed) => `rss:${feed.id}` === query.provider)
      )
        return send(res, 400, { error: 'Unknown configured feed' });
      if (!allow(clientKey(req)))
        return send(res, 429, { error: 'News request rate limited' }, 60);
      const key = JSON.stringify(query);
      const cached = cache.get(key);
      if (cached && now() - cached.at < 300000)
        return send(res, 200, { ...cached.payload, cache: 'hit' });
      const stale = () =>
        cached && now() - cached.at < 3600000
          ? { ...cached.payload, status: 'stale', cache: 'stale' }
          : null;
      let pending = inflight.get(key);
      if (!pending) {
        if (now() < nextFetchAt || inflight.size >= 4) {
          const retained = stale();
          return retained
            ? send(res, 200, retained)
            : send(
                res,
                429,
                { error: 'News refresh cooldown' },
                Math.max(5, Math.ceil((nextFetchAt - now()) / 1000)),
              );
        }
        nextFetchAt = now() + 5000;
        pending = Promise.resolve()
          .then(() =>
            query.provider.startsWith('rss:')
              ? fetchConfiguredNews(query, feeds, configuredReader, now)
              : fetchNews(query),
          )
          .then((result) => {
            if (!Array.isArray(result.articles))
              throw new Error('Malformed news response');
            const cutoff = now() - query.hours * 3600000;
            const articles = result.articles
              .filter(
                (a) =>
                  !a.publishedAt ||
                  (Date.parse(a.publishedAt) >= cutoff &&
                    Date.parse(a.publishedAt) <= now()),
              )
              .slice(0, 25);
            const payload = {
              status: result.stale
                ? 'stale'
                : result.partial
                  ? 'partial'
                  : 'ready',
              newsStatus: articles.length ? 'ready' : 'empty',
              retrievedAt: result.retrievedAt || new Date(now()).toISOString(),
              newsSource: result.source,
              ...(result.freshForMs
                ? { newsFreshForMs: result.freshForMs }
                : {}),
              ...(result.timeMeaning
                ? { newsTimeMeaning: result.timeMeaning }
                : {}),
              newsQuery:
                result.queryLabel ||
                `${NEWS_TOPICS[query.topic].label}${query.keywords ? ` · ${query.keywords}` : ''}${query.region ? ` · region text: ${query.region}` : ' · worldwide query'}`,
              articles,
              query,
              coverage:
                'At most 25 indexed reports; not exhaustive and not verified incidents.',
            };
            cache.delete(key);
            cache.set(key, { at: now(), payload });
            while (cache.size > 64) cache.delete(cache.keys().next().value);
            return payload;
          })
          .catch(() => {
            nextFetchAt = Math.max(nextFetchAt, now() + 30000);
            throw new Error('News providers unavailable');
          })
          .finally(() => inflight.delete(key));
        inflight.set(key, pending);
      }
      try {
        return send(res, 200, { ...(await pending), cache: 'miss' });
      } catch {
        const retained = stale();
        return retained
          ? send(res, 200, retained)
          : send(res, 503, { error: 'News providers unavailable' }, 30);
      }
    });
  };
  return {
    name: 'monitoring-news-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}
