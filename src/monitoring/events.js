/** Nullable monitoring projections. Reports never acquire coordinates from a query. */
export function httpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
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
    const linkHost = new URL(url).hostname.toLowerCase();
    const aggregator = google || linkHost === 'news.google.com';
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
        originalUrl: aggregator ? null : url,
        linkKind: aggregator ? 'aggregator' : 'provider-reported',
        linkHost,
        timeMs: eventTime(article.publishedAt),
        timeMeaning: [
          'Publication (Atom)',
          'Update (Atom)',
          'Publication/update (Atom)',
          'Publication (RSS)',
        ].includes(article.timestampMeaning)
          ? article.timestampMeaning
          : ['Publication/update (Atom)', 'Publication (RSS)'].includes(
                payload.newsTimeMeaning,
              )
            ? payload.newsTimeMeaning
            : google
              ? 'Publication (RSS)'
              : 'Indexed (GDELT)',
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

/** Comparison key only: opening a link always retains the provider-supplied URL. */
export function reportLinkKey(value) {
  const safe = httpUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || /^(fbclid|gclid|msclkid|igshid)$/i.test(key))
      url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.href;
}

function headlineKey(row) {
  let title = String(row.title || '')
    .normalize('NFKC')
    .trim();
  const suffix = ` - ${row.publisher || ''}`;
  if (
    row.source === 'Google News RSS' &&
    row.publisher &&
    title.toLowerCase().endsWith(suffix.toLowerCase())
  )
    title = title.slice(0, -suffix.length);
  const key = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return key.length >= 40 ? key : null;
}

/** Heuristic groups for the currently filtered cohort; never corroboration or geolocation. */
export function groupNewsReports(rows) {
  const byLink = new Map();
  for (const row of rows
    .filter((row) => row.category === 'report')
    .sort((a, b) => a.id.localeCompare(b.id))) {
    const key = reportLinkKey(row.sourceUrl) || row.id;
    if (!byLink.has(key)) byLink.set(key, []);
    byLink.get(key).push(row);
  }
  const groups = [];
  for (const members of byLink.values()) {
    const key = headlineKey(members[0]);
    const match =
      key &&
      groups.find((group) => {
        const cohort = [...group.members, ...members];
        if (
          !cohort.every(
            (row) => headlineKey(row) === key && Number.isFinite(row.timeMs),
          )
        )
          return false;
        const times = cohort.map((row) => row.timeMs);
        return Math.max(...times) - Math.min(...times) <= 86400000;
      });
    if (match) {
      match.members.push(...members);
      match.reasons.add('matching headline within 24 hours');
      if (members.length > 1) match.reasons.add('matching normalized URL');
    } else
      groups.push({
        members: [...members],
        reasons: new Set(members.length > 1 ? ['matching normalized URL'] : []),
      });
  }
  return groups.map((group) => ({
    id: `report-group:${group.members[0].id}`,
    members: group.members,
    reason: [...group.reasons].join('; '),
  }));
}
