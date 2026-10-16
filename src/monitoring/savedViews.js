/** Local, explicitly saved loaded-record filters. Acquisition and camera state are excluded. */
export const SAVED_VIEWS_KEY = 'gev.monitoring.views.v1';
const MAX_VIEWS = 12;
const MAX_BYTES = 32768;

function text(value, max) {
  if (typeof value !== 'string' || value.length > max)
    throw new Error('Invalid view text.');
  return value;
}
function filters(value) {
  if (
    !value ||
    !['all', 'earthquake', 'report'].includes(value.category) ||
    ![0, 1, 6, 24].includes(value.hours) ||
    typeof value.includeUnknownTime !== 'boolean' ||
    typeof value.includeUnlocated !== 'boolean'
  )
    throw new Error('Invalid saved filters.');
  let bounds = null;
  if (value.bounds !== null) {
    const b = value.bounds;
    if (
      !b ||
      !['west', 'east', 'south', 'north'].every((k) => Number.isFinite(b[k])) ||
      Math.abs(b.west) > 180 ||
      Math.abs(b.east) > 180 ||
      Math.abs(b.south) > 90 ||
      Math.abs(b.north) > 90 ||
      b.south > b.north
    )
      throw new Error('Invalid saved region.');
    bounds = { west: b.west, east: b.east, south: b.south, north: b.north };
  }
  return {
    category: value.category,
    source: text(value.source, 200),
    publisher: text(value.publisher, 200),
    keyword: text(value.keyword, 120),
    hours: value.hours,
    bounds,
    includeUnknownTime: value.includeUnknownTime,
    includeUnlocated: value.includeUnlocated,
  };
}
function viewName(name) {
  const clean = text(name, 60).trim();
  if (!clean) throw new Error('Enter a view name (up to 60 characters).');
  return clean;
}
export function createSavedMonitoringViews(storage) {
  function read() {
    if (!storage)
      throw new Error('Saved views are unavailable on this device.');
    const raw = storage.getItem(SAVED_VIEWS_KEY);
    if (raw === null) return [];
    if (typeof raw !== 'string' || raw.length > MAX_BYTES / 2)
      throw new Error('Saved views could not be read; existing data was kept.');
    const data = JSON.parse(raw);
    if (
      data?.version !== 1 ||
      !Array.isArray(data.views) ||
      data.views.length > MAX_VIEWS
    )
      throw new Error('Unsupported saved views; existing data was kept.');
    const names = new Set();
    return data.views.map((v) => {
      const name = viewName(v.name);
      if (names.has(name.toLowerCase()))
        throw new Error('Duplicate saved view.');
      names.add(name.toLowerCase());
      return { name, filters: filters(v.filters) };
    });
  }
  function write(views) {
    const raw = JSON.stringify({ version: 1, views });
    if (raw.length * 2 > MAX_BYTES)
      throw new Error('Saved view storage limit reached.');
    storage.setItem(SAVED_VIEWS_KEY, raw);
    return views;
  }
  return {
    list: read,
    save(name, current) {
      name = viewName(name);
      const views = read();
      const index = views.findIndex(
        (v) => v.name.toLowerCase() === name.toLowerCase(),
      );
      const view = { name, filters: filters(current) };
      if (index >= 0) views[index] = view;
      else {
        if (views.length >= MAX_VIEWS)
          throw new Error('Delete a view before saving another (maximum 12).');
        views.push(view);
      }
      return write(views);
    },
    remove(name) {
      return write(read().filter((v) => v.name !== name));
    },
  };
}
