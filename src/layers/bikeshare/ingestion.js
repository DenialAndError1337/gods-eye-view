import { CITY_BY_ID } from './registry.js';
import { parseGbfsUpdatedAt } from '../../sources/gbfsStations.js';

export function createIngestion({
  state: layerState,
  services,
  parts,
  source,
}) {
  layerState._cityAcquisitionHealth ??= new Map();
  /**
   * Convert an upstream GBFS URL into a local proxy URL.
   * The dev server proxies /api/gbfs/* to avoid CORS issues with third-party feeds.
   * @param {string} upstreamUrl - Full HTTPS GBFS endpoint URL.
   * @returns {string} Relative proxy URL.
   */

  function toProxyUrl(upstreamUrl) {
    return `/api/gbfs/${encodeURIComponent(upstreamUrl)}`;
  }

  /** Increment the loading reference count and mark loading state active. */

  function beginLoading() {
    layerState._loadingOps++;
    layerState._loading = true;
  }

  /** Decrement the loading reference count; clear loading flag when zero. */

  function endLoading() {
    layerState._loadingOps = Math.max(0, layerState._loadingOps - 1);
    layerState._loading = layerState._loadingOps > 0;
  }

  /**
   * Fetch and parse JSON from a GBFS endpoint via the local proxy.
   * @param {string} upstreamUrl - Full HTTPS GBFS endpoint URL.
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal] - Optional abort signal for cancellation.
   * @returns {Promise<Object>} Parsed JSON payload.
   * @throws {Error} On non-OK HTTP status or malformed JSON.
   */

  async function fetchGbfsJson(upstreamUrl, options) {
    return source.getStations(upstreamUrl, options);
  }

  /** One actual adapter call; cache hits and coalesced callers never enter here. */
  async function runCityRequest(
    cityId,
    channel,
    controller,
    acquire,
    parse,
    commit,
  ) {
    const history = layerState._cityAcquisitionHealth;
    const city = history.get(cityId) || {};
    const health = {
      operatorUpdatedAt: null,
      lastAccepted: null,
      lastCompletion: null,
      ...city[channel],
      lastAttempt: Date.now(),
      outcome: 'pending',
    };
    city[channel] = health;
    history.set(cityId, city);
    const owns = () =>
      layerState._cityAcquisitionHealth === history &&
      history.get(cityId)?.[channel] === health;
    const finish = (outcome) => {
      if (!owns() || health.outcome !== 'pending') return;
      health.outcome = outcome;
      health.lastCompletion = Date.now();
      if (outcome === 'accepted') health.lastAccepted = health.lastCompletion;
    };
    let released = false;
    let rejectCancellation;
    const releaseLoading = () => {
      if (released) return;
      released = true;
      if (layerState._cityAcquisitionHealth === history) endLoading();
    };
    const onAbort = () => {
      finish('cancelled');
      releaseLoading();
      rejectCancellation?.(
        new DOMException('GBFS request cancelled', 'AbortError'),
      );
    };
    const assertCurrent = () => {
      controller.signal.throwIfAborted();
      if (!owns())
        throw new DOMException('GBFS request superseded', 'AbortError');
    };
    beginLoading();
    controller.signal.addEventListener('abort', onAbort, { once: true });
    try {
      assertCurrent();
      const cancellation = new Promise((_, reject) => {
        rejectCancellation = reject;
      });
      const payload = await Promise.race([acquire(), cancellation]);
      assertCurrent();
      const value = parse(payload);
      assertCurrent();
      commit(value);
      health.operatorUpdatedAt = parseGbfsUpdatedAt(payload?.last_updated);
      finish('accepted');
      return value;
    } catch (error) {
      const cancelled =
        controller.signal.aborted || !owns() || error?.name === 'AbortError';
      finish(cancelled ? 'cancelled' : 'failed');
      if (cancelled)
        throw new DOMException('GBFS request cancelled', 'AbortError');
      throw error;
    } finally {
      controller.signal.removeEventListener('abort', onAbort);
      releaseLoading();
    }
  }

  /**
   * Abort an in-flight GBFS request for a specific city and remove it from the map.
   * @param {Map<string, { controller: AbortController }>} map - In-flight request map.
   * @param {string} cityId - City whose request should be cancelled.
   */

  function abortInFlight(map, cityId) {
    const entry = map.get(cityId);
    if (!entry) return;
    try {
      entry.controller?.abort();
    } catch {
      // no-op
    }
    map.delete(cityId);
  }

  /** Abort all in-flight station info and status requests across all cities. */

  function abortAllInFlight() {
    for (const cityId of layerState._inFlightInfo.keys())
      abortInFlight(layerState._inFlightInfo, cityId);
    for (const cityId of layerState._inFlightStatus.keys())
      abortInFlight(layerState._inFlightStatus, cityId);
  }

  /**
   * Load station information for a city. Returns cached data if available,
   * deduplicates concurrent requests, and caches the result on success.
   * Station info is static metadata (location, name, capacity) and is
   * fetched once per city per session.
   * @param {string} cityId - City identifier.
   * @param {number} generation - Proximity generation to detect stale requests.
   * @returns {Promise<Map<string, Object>>} Map of stationId to station info.
   * @throws {Error} On unknown city, fetch failure, or empty station list.
   */

  async function loadCityStationInfo(cityId, generation) {
    if (layerState._stationInfoCache.has(cityId))
      return layerState._stationInfoCache.get(cityId);
    const inFlight = layerState._inFlightInfo.get(cityId);
    if (inFlight) return inFlight.promise;

    const city = CITY_BY_ID.get(cityId);
    if (!city) throw new Error(`Unknown GBFS city "${cityId}"`);
    const controller = new AbortController();

    const promise = runCityRequest(
      cityId,
      'information',
      controller,
      () =>
        fetchGbfsJson(city.stationInformationUrl, {
          signal: controller.signal,
        }),
      (payload) => {
        const stationMap = parts.model.stationsWithinCity(
          city,
          parts.model.parseStationInformation(payload),
        );
        if (stationMap.size === 0) {
          throw new Error(`No station information for ${city.city}`);
        }
        return stationMap;
      },
      (stationMap) => layerState._stationInfoCache.set(cityId, stationMap),
    ).finally(() => {
      // Clean up in-flight entry only if it is still ours (not replaced by a newer request)
      const current = layerState._inFlightInfo.get(cityId);
      if (current && current.controller === controller)
        layerState._inFlightInfo.delete(cityId);
    });

    layerState._inFlightInfo.set(cityId, { promise, controller, generation });
    return promise;
  }

  /**
   * Load real-time station status for a city (bike/dock counts, operational flags).
   * Unlike station info, status is NOT served from cache — it is always re-fetched
   * to keep availability data current. Concurrent requests are deduplicated.
   * @param {string} cityId - City identifier.
   * @param {number} generation - Proximity generation to detect stale requests.
   * @returns {Promise<Map<string, Object>>} Map of stationId to status objects.
   * @throws {Error} On unknown city or fetch failure.
   */

  async function loadCityStationStatus(cityId, generation) {
    const inFlight = layerState._inFlightStatus.get(cityId);
    if (inFlight) return inFlight.promise;

    const city = CITY_BY_ID.get(cityId);
    if (!city) throw new Error(`Unknown GBFS city "${cityId}"`);
    const controller = new AbortController();

    const promise = runCityRequest(
      cityId,
      'status',
      controller,
      () =>
        fetchGbfsJson(city.stationStatusUrl, {
          signal: controller.signal,
        }),
      (payload) => parts.model.parseStationStatus(payload),
      (statusMap) => {
        layerState._statusCache.set(cityId, {
          statusMap,
          timestamp: Date.now(),
        });
      },
    ).finally(() => {
      const current = layerState._inFlightStatus.get(cityId);
      if (current && current.controller === controller)
        layerState._inFlightStatus.delete(cityId);
    });

    layerState._inFlightStatus.set(cityId, { promise, controller, generation });
    return promise;
  }
  const methods = {
    /**
     * Periodic update tick — re-fetches station status for all active cities
     * and refreshes point colors/sizes. Called by the layer manager at
     * STATUS_POLL_MS intervals.
     * @returns {Promise<void>}
     */
    async update() {
      if (!layerState._enabled || layerState._activeCityIds.size === 0) return;

      const generation = layerState._proximityGeneration;
      const cityIds = Array.from(layerState._activeCityIds);
      const isCurrent = (cityId) =>
        layerState._enabled &&
        layerState._activeCityIds.has(cityId) &&
        generation === layerState._proximityGeneration;
      let refreshed = false;
      await Promise.all(
        cityIds.map(async (cityId) => {
          try {
            const statusMap = await loadCityStationStatus(cityId, generation);
            if (!isCurrent(cityId)) return;
            parts.rendering.applyStatusToPoints(cityId, statusMap);
            layerState._failedCityIds.delete(cityId);
            refreshed = true;
          } catch (error) {
            if (error?.name === 'AbortError' || !isCurrent(cityId)) return;
            console.warn(
              `[Data:Bikeshare] ${cityId} status update error:`,
              error,
            );
            layerState._failedCityIds.add(cityId);
          }
        }),
      );

      layerState._count = layerState._stationRenderMap.size;
      // Freshness advances only on a poll that actually refreshed a city.
      if (refreshed && layerState._count > 0)
        layerState._lastUpdate = Date.now();
    },
  };

  return {
    toProxyUrl,
    beginLoading,
    endLoading,
    fetchGbfsJson,
    abortInFlight,
    abortAllInFlight,
    loadCityStationInfo,
    loadCityStationStatus,
    methods,
  };
}
