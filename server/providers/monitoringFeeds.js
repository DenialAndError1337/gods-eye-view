import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { Readable } from 'node:stream';
import { isIP } from 'node:net';
import { isPublicRadioAddress } from './radio/transport.js';
import { readResponseTextCapped } from './common/http.js';
import { normalizeRssArticles } from './regional/news.js';

/** Local operator inventory, never a browser-supplied destination. */
export function configuredNewsFeeds(value = '') {
  if (!value) return [];
  const rows = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(rows) || rows.length > 8)
    throw new Error('Invalid feed inventory');
  const ids = new Set();
  return rows.map((row) => {
    if (
      !row ||
      !/^[a-z][a-z0-9-]{0,31}$/.test(row.id) ||
      ids.has(row.id) ||
      typeof row.label !== 'string' ||
      !row.label.trim() ||
      row.label.length > 80
    )
      throw new Error('Invalid feed inventory');
    const refreshMinutes = row.refreshMinutes ?? 15;
    if (
      !Number.isInteger(refreshMinutes) ||
      refreshMinutes < 5 ||
      refreshMinutes > 1440 ||
      typeof row.url !== 'string' ||
      row.url.length > 2048
    )
      throw new Error('Invalid feed inventory');
    const url = new URL(row.url);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      isIP(url.hostname.replace(/^\[|\]$/g, '')) ||
      !url.hostname.includes('.') ||
      /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(
        url.hostname,
      )
    )
      throw new Error('Invalid feed inventory');
    ids.add(row.id);
    return {
      id: row.id,
      label: row.label.trim(),
      url: url.href,
      host: url.hostname,
      refreshMinutes,
    };
  });
}

function pinnedRequest(url, addresses, signal) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: 'GET',
        signal,
        headers: {
          Accept: 'application/rss+xml, application/xml, text/xml',
          'Accept-Encoding': 'identity',
          'User-Agent': 'GodsEyeView-Monitoring/1.0',
        },
        lookup(_host, options, callback) {
          if (options?.all) callback(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        },
      },
      (response) => {
        try {
          const status = response.statusCode || 500;
          if (status !== 200) {
            response.destroy();
            reject(new Error('RSS response unavailable'));
            return;
          }
          const headers = new Headers();
          for (const [name, value] of Object.entries(response.headers))
            if (value !== undefined)
              headers.set(
                name,
                Array.isArray(value) ? value.join(', ') : String(value),
              );
          resolve(new Response(Readable.toWeb(response), { status, headers }));
        } catch {
          response.destroy();
          reject(new Error('RSS response unavailable'));
        }
      },
    );
    request.on('error', reject);
    request.end();
  });
}

/** Resolve once, pin public addresses to TLS request, refuse redirects, cap body and whole deadline. */
export async function readConfiguredNewsFeed(
  feed,
  { lookupImpl = lookup, requestImpl = pinnedRequest, timeoutMs = 12000 } = {},
) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('RSS request timed out'));
    }, timeoutMs);
  });
  const acquire = async () => {
    const addresses = await lookupImpl(new URL(feed.url).hostname, {
      all: true,
      verbatim: true,
    });
    controller.signal.throwIfAborted();
    if (
      !Array.isArray(addresses) ||
      !addresses.length ||
      addresses.some((row) => !isPublicRadioAddress(row.address))
    )
      throw new Error('RSS destination unavailable');
    const response = await requestImpl(
      new URL(feed.url),
      addresses,
      controller.signal,
    );
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error('RSS response unavailable');
    }
    const encoding = response.headers.get('content-encoding');
    if (encoding && encoding !== 'identity') {
      await response.body?.cancel();
      throw new Error('Unsupported RSS encoding');
    }
    return await readResponseTextCapped(
      response,
      2 * 1024 * 1024,
      controller.signal,
    );
  };
  try {
    return await Promise.race([acquire(), deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function validRss(xml) {
  return (
    typeof xml === 'string' &&
    /<rss(?:\s|>)/i.test(xml) &&
    /<channel(?:\s|>)/i.test(xml) &&
    /<\/rss\s*>/i.test(xml) &&
    /<\/channel\s*>/i.test(xml) &&
    !/<!DOCTYPE|<!ENTITY/i.test(xml) &&
    [...xml.matchAll(/<item(?:\s|>)/gi)].length ===
      [...xml.matchAll(/<\/item\s*>/gi)].length
  );
}

/** Per-feed acquisition spacing and cache are shared across headline-query variants. */
export function configuredFeedReader({
  readFeed = readConfiguredNewsFeed,
  now = Date.now,
} = {}) {
  const entries = new Map();
  return async (feed) => {
    let entry = entries.get(feed.id);
    if (!entry) {
      entry = { value: null, nextAt: 0, pending: null };
      entries.set(feed.id, entry);
    }
    if (entry.pending) return entry.pending;
    const ttl = feed.refreshMinutes * 60000;
    if (entry.value && now() - entry.value.fetchedAt < ttl)
      return { ...entry.value, stale: false };
    const fallback = () => {
      if (entry.value && now() - entry.value.fetchedAt < ttl + 3600000)
        return { ...entry.value, stale: true };
      throw new Error('Configured feed unavailable');
    };
    if (now() < entry.nextAt) return fallback();
    entry.nextAt = now() + ttl;
    entry.pending = Promise.resolve()
      .then(() => readFeed(feed))
      .then((xml) => {
        if (!validRss(xml)) throw new Error('Unsupported RSS response');
        entry.value = { xml, fetchedAt: now() };
        return { ...entry.value, stale: false };
      })
      .catch(fallback)
      .finally(() => {
        entry.pending = null;
      });
    return entry.pending;
  };
}

export async function fetchConfiguredNews(
  query,
  feeds,
  readFeed,
  now = Date.now,
) {
  const feed = feeds.find((row) => `rss:${row.id}` === query.provider);
  if (!feed) throw new Error('Unknown configured feed');
  const result = await readFeed(feed);
  const xml = result.xml;
  if (!validRss(xml)) throw new Error('Unsupported RSS response');
  const terms = [query.keywords, query.region]
    .filter(Boolean)
    .map((term) => term.toLowerCase());
  const clock = now();
  const articles = normalizeRssArticles(xml, 250)
    .filter(
      (row) =>
        (!row.publishedAt ||
          (Date.parse(row.publishedAt) >= clock - query.hours * 3600000 &&
            Date.parse(row.publishedAt) <= clock)) &&
        terms.every((term) => row.title.toLowerCase().includes(term)),
    )
    .slice(0, 25);
  return {
    articles,
    stale: result.stale,
    freshForMs: feed.refreshMinutes * 60000,
    retrievedAt: new Date(result.fetchedAt).toISOString(),
    source: `Configured RSS · ${feed.label}`,
    timeMeaning: 'Publication (RSS)',
    queryLabel: `RSS ${feed.label} · latest feed items; topic not applied${terms.length ? ' · phrase/region headline filters' : ''}`,
  };
}
