/** Shared, transient monitoring cohort. No acquisition, rendering or durable preferences. */
export const defaultFilters = () => ({
  category: 'all',
  source: 'all',
  keyword: '',
  publisher: 'all',
  hours: 24,
  bounds: null,
  includeUnknownTime: true,
  includeUnlocated: true,
});
export function eventMatches(event, filters, now = Date.now()) {
  if (
    filters.publisher &&
    filters.publisher !== 'all' &&
    event.publisher !== filters.publisher
  )
    return false;
  const keyword = (filters.keyword || '').trim().toLocaleLowerCase();
  if (
    keyword &&
    ![
      event.title,
      event.description,
      event.source,
      event.publisher,
      event.queryContext,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase()
      .includes(keyword)
  )
    return false;
  if (filters.category !== 'all' && event.category !== filters.category)
    return false;
  if (filters.source !== 'all' && event.source !== filters.source) return false;
  if (event.timeMs == null) {
    if (!filters.includeUnknownTime) return false;
  } else if (
    filters.hours &&
    (event.timeMs < now - filters.hours * 3600000 || event.timeMs > now)
  )
    return false;
  if (filters.bounds) {
    if (!event.coordinates) return filters.includeUnlocated;
    const { west, south, east, north } = filters.bounds;
    const { lat, lon } = event.coordinates;
    if (lat < south || lat > north) return false;
    if (west <= east ? lon < west || lon > east : lon < west && lon > east)
      return false;
  }
  return true;
}
export function createMonitoringStore({ now = Date.now } = {}) {
  let groups = new Map();
  let filters = defaultFilters();
  let selectedId = null;
  let selectionNotice = '';
  const listeners = new Set();
  function snapshot() {
    const all = [...groups.values()].flat();
    const rows = all
      .filter((e) => eventMatches(e, filters, now()))
      .sort(
        (a, b) =>
          (b.timeMs ?? -Infinity) - (a.timeMs ?? -Infinity) ||
          a.id.localeCompare(b.id),
      );
    return {
      all,
      rows,
      filters: { ...filters },
      selectedId,
      selectionNotice,
      selected: rows.find((e) => e.id === selectedId) || null,
    };
  }
  function publish() {
    let view = snapshot();
    if (selectedId && !view.selected) {
      selectionNotice = view.all.some((e) => e.id === selectedId)
        ? 'Selection is outside the current filters.'
        : 'Selected record is no longer in the loaded feed.';
      selectedId = null;
      view = snapshot();
    }
    for (const fn of listeners) fn(view);
  }
  return {
    snapshot,
    replace(key, rows) {
      groups.set(key, rows);
      publish();
    },
    filter(patch) {
      filters = { ...filters, ...patch };
      publish();
    },
    reset() {
      filters = defaultFilters();
      selectionNotice = '';
      publish();
    },
    select(id) {
      selectedId = id;
      selectionNotice = '';
      publish();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    destroy() {
      groups.clear();
      listeners.clear();
    },
  };
}
