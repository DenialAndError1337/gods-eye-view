/** Nullable monitoring projections. Reports never acquire coordinates from a query. */
export function httpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function eventTime(value) {
  if (value == null || value === '') return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? ms : null;
}
export function earthquakeEvent(row) {
  return {
    id: `usgs:${row.stableId}`,
    nativeId: row.stableId,
    category: 'earthquake',
    kind: 'Observation',
    title: `M${row.mag.toFixed(1)} · ${row.place || 'Location unnamed'}`,
    description: `Depth: ${row.depthKm == null ? 'unknown' : `${row.depthKm} km`}. USGS magnitude 2.5+ observations from the trailing-day feed.`,
    source: 'USGS',
    sourceUrl: httpUrl(row.url),
    originalUrl: httpUrl(row.url),
    timeMs: eventTime(row.time),
    timeMeaning: 'Occurrence',
    coordinates: { lat: row.lat, lon: row.lon },
    locationEvidence: 'USGS reported epicenter',
    queryContext: null,
  };
}
export function newsEvents(payload) {
  const source = payload.newsSource || 'Regional news';
  const seen = new Set();
  return (payload.articles || []).flatMap((article) => {
    const url = httpUrl(article.url);
    if (!url || !article.title || seen.has(url)) return [];
    seen.add(url);
    // Google's RSS links may redirect; do not promise a resolved publisher URL.
    const google = source === 'Google News RSS';
    return [
      {
        id: `news:${source}:${url}`,
        nativeId: null,
        category: 'report',
        kind: 'Report · not independently corroborated',
        title: String(article.title),
        description: null,
        source,
        publisher: article.domain || 'Unknown publisher',
        sourceUrl: url,
        originalUrl: google ? null : url,
        timeMs: eventTime(article.publishedAt),
        timeMeaning: google ? 'Publication (RSS)' : 'Indexed (GDELT)',
        coordinates: null,
        locationEvidence:
          'Unlocated report; query context is not incident geography',
        queryContext: payload.place?.label || payload.newsQuery || null,
      },
    ];
  });
}
export function formatEventTime(event) {
  return event.timeMs == null
    ? 'Unknown time'
    : `${new Date(event.timeMs).toISOString().replace('T', ' ').slice(0, 19)} UTC`;
}
