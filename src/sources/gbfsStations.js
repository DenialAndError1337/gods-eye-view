/** Parse GBFS station documents, tolerating field-name variations across providers. */

/**
 * Coerce a GBFS boolean field to a native boolean.
 * GBFS feeds are inconsistent — some use booleans, others use 0/1 or strings.
 * @param {*} value - Raw field value from GBFS JSON.
 * @param {boolean} [fallback=true] - Default when value is null/undefined/unrecognized.
 * @returns {boolean}
 */
export function normalizeGbfsBool(value, fallback = true) {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;
  const num = Number(value);
  if (Number.isFinite(num)) return num !== 0;
  const text = String(value).trim().toLowerCase();
  if (text === 'true' || text === 'yes') return true;
  if (text === 'false' || text === 'no') return false;
  return fallback;
}

/**
 * Parse a value as a non-negative integer, returning fallback on failure.
 * @param {*} value - Raw numeric value.
 * @param {number|null} [fallback=null] - Returned when value is not a valid non-negative number.
 * @returns {number|null}
 */
export function toNonNegativeInteger(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

/**
 * Extract the stations array from a GBFS JSON payload.
 * Handles multiple response shapes: { data: { stations: [...] } },
 * { data: [...] }, and nested objects with a stations sub-key.
 * @param {Object} payload - Parsed GBFS JSON response.
 * @returns {Object[]} Array of raw station objects (may be empty).
 */
export function extractStationsArray(payload) {
  const data = payload?.data;
  if (Array.isArray(data?.stations)) return data.stations;
  if (Array.isArray(data)) return data;
  // Some feeds nest stations under an additional key (e.g. locale wrappers)
  if (data && typeof data === 'object') {
    for (const value of Object.values(data)) {
      if (Array.isArray(value?.stations)) return value.stations;
    }
  }
  return [];
}

/** Read legacy text or a GBFS v3 Localized String, preferring usable English text. */
function stationName(value) {
  if (typeof value === 'string') return value.trim();
  if (!Array.isArray(value)) return '';

  let fallback = '';
  for (const translation of value) {
    if (typeof translation?.text !== 'string') continue;
    const text = translation.text.trim();
    if (!text) continue;
    if (!fallback) fallback = text;
    if (
      typeof translation.language === 'string' &&
      /^en(?:-|$)/i.test(translation.language.trim())
    )
      return text;
  }
  return fallback;
}

/**
 * Parse a GBFS station_information payload into a Map of station metadata.
 * Handles field-name variations across different GBFS providers
 * (station_id vs id, lat vs latitude, etc.). Stations with missing or
 * invalid coordinates are silently skipped.
 * @param {Object} payload - Parsed station_information.json response.
 * @returns {Map<string, Object>} Map of stationId to station info objects.
 */
export function parseStationInformation(payload) {
  const stations = extractStationsArray(payload);
  const stationMap = new Map();

  for (const raw of stations) {
    // Accept both GBFS (station_id) and alternate (id) field names
    const stationId = String(raw?.station_id ?? raw?.id ?? '').trim();
    const lat = Number(raw?.lat ?? raw?.latitude);
    const lon = Number(raw?.lon ?? raw?.longitude);
    if (!stationId || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    stationMap.set(stationId, {
      stationId,
      name: stationName(raw?.name) || stationName(raw?.short_name),
      lat,
      lon,
      capacity: toNonNegativeInteger(raw?.capacity),
      isInstalled: normalizeGbfsBool(raw?.is_installed, true),
      isRenting: normalizeGbfsBool(raw?.is_renting, true),
      isReturning: normalizeGbfsBool(raw?.is_returning, true),
    });
  }

  return stationMap;
}

/**
 * Parse a GBFS station_status payload into a Map of real-time availability.
 * @param {Object} payload - Parsed station_status.json response.
 * @returns {Map<string, Object>} Map of stationId to status objects containing
 *   bikesAvailable, docksAvailable, and operational flags.
 */
export function parseStationStatus(payload) {
  const stations = extractStationsArray(payload);
  const statusMap = new Map();

  for (const raw of stations) {
    const stationId = String(raw?.station_id ?? raw?.id ?? '').trim();
    if (!stationId) continue;

    const bikes = toNonNegativeInteger(raw?.num_bikes_available);
    const docks = toNonNegativeInteger(raw?.num_docks_available);
    statusMap.set(stationId, {
      stationId,
      bikesAvailable: bikes,
      docksAvailable: docks,
      isInstalled: normalizeGbfsBool(raw?.is_installed, true),
      isRenting: normalizeGbfsBool(raw?.is_renting, true),
      isReturning: normalizeGbfsBool(raw?.is_returning, true),
      lastReported: toNonNegativeInteger(raw?.last_reported),
    });
  }

  return statusMap;
}

/**
 * Read a feed's reported last_updated as epoch milliseconds. Legacy GBFS uses
 * integer Unix seconds; v3 uses RFC3339. No receipt-time fallback or freshness
 * inference. Unsupported leap seconds and malformed dates remain unknown.
 */
export function parseGbfsUpdatedAt(value) {
  const maxMs = 253402300799999; // last millisecond of year 9999
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) &&
      value > 0 &&
      value <= Math.floor(maxMs / 1000)
      ? value * 1000
      : null;
  }
  if (typeof value !== 'string' || value.length > 64) return null;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match) return null;
  const [, y, m, d, h, min, s, , offsetH, offsetM] = match;
  const year = Number(y),
    month = Number(m),
    day = Number(d);
  if (
    year < 1970 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
    Number(h) > 23 ||
    Number(min) > 59 ||
    Number(s) > 59 ||
    Number(offsetH || 0) > 23 ||
    Number(offsetM || 0) > 59
  )
    return null;
  const at = Date.parse(value.toUpperCase());
  return Number.isFinite(at) && at > 0 && at <= maxMs ? at : null;
}
