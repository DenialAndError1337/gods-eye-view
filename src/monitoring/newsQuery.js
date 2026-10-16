/** Shared bounded query vocabulary. Text filters never become URLs or arbitrary provider syntax. */
export const NEWS_TOPICS = Object.freeze({
  international: {
    label: 'International affairs',
    query: '"international relations" OR diplomacy OR geopolitics',
  },
  diplomacy: {
    label: 'Diplomacy',
    query: 'diplomacy OR "peace talks" OR summit',
  },
  security: {
    label: 'Security',
    query: '"international security" OR "security council" OR sanctions',
  },
  conflict: {
    label: 'Conflict',
    query: '"armed conflict" OR ceasefire OR war',
  },
  humanitarian: {
    label: 'Humanitarian',
    query: 'humanitarian OR refugees OR "disaster relief"',
  },
});
const clean = (value) =>
  value
    .replace(/[^\p{L}\p{N}\s.,'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export function monitoringNewsQuery(params) {
  const allowed = new Set(['topic', 'keywords', 'region', 'hours', 'provider']);
  for (const key of params.keys())
    if (!allowed.has(key) || params.getAll(key).length !== 1) return null;
  const topic = params.get('topic') || 'international';
  const provider = params.get('provider') || 'auto';
  const rawHours = params.get('hours') || '24';
  const keywords = params.get('keywords') || '';
  const region = params.get('region') || '';
  if (
    !Object.hasOwn(NEWS_TOPICS, topic) ||
    !['auto', 'google', 'gdelt'].includes(provider) ||
    !['24', '48', '168'].includes(rawHours) ||
    keywords.length > 120 ||
    region.length > 80
  )
    return null;
  return {
    topic,
    provider,
    hours: Number(rawHours),
    keywords: clean(keywords),
    region: clean(region),
  };
}
export function newsSearchExpression(query) {
  return [
    `(${NEWS_TOPICS[query.topic].query})`,
    query.keywords ? `"${query.keywords}"` : '',
    query.region ? `"${query.region}"` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
