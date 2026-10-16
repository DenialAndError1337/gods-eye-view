import { newsEvents } from './events.js';
/** One explicit regional query; superseded or closed-panel work cannot publish. */
export function createMonitoringNews({ service, publish, now = Date.now }) {
  let request;
  let epoch = 0;
  let destroyed = false;
  let key = null;
  let state = {
    status: 'disabled',
    rows: [],
    context: '',
    lastSuccess: null,
    lastAttempt: null,
    lastAcceptedAt: null,
    lastOutcome: 'never',
    retryReason: null,
    freshnessMs: 300000,
    retryAt: 0,
  };
  const emit = () => publish({ ...state });
  async function run(nextKey, context, acquire) {
    if (destroyed) return;
    if (now() < state.retryAt) {
      emit();
      return;
    }
    request?.abort();
    const token = ++epoch;
    const sameRegion = nextKey === key;
    key = nextKey;
    request = new AbortController();
    const signal = request.signal;
    state = {
      ...state,
      status: 'loading',
      lastAttempt: now(),
      lastOutcome: 'pending',
      error: null,
      context,
      ...(sameRegion
        ? {}
        : { rows: [], lastSuccess: null, lastAcceptedAt: null }),
    };
    emit();
    try {
      const payload = await acquire(signal);
      if (destroyed || signal.aborted || token !== epoch) return;
      const rows = newsEvents(payload);
      state = {
        ...state,
        rows,
        lastSuccess: payload.retrievedAt || null,
        freshnessMs:
          Number.isFinite(payload.newsFreshForMs) &&
          payload.newsFreshForMs >= 300000 &&
          payload.newsFreshForMs <= 86400000
            ? payload.newsFreshForMs
            : 300000,
        lastAcceptedAt:
          payload.newsStatus === 'unavailable' ? state.lastAcceptedAt : now(),
        lastOutcome:
          payload.newsStatus === 'unavailable'
            ? 'failed'
            : payload.status === 'stale'
              ? 'stale'
              : payload.status === 'partial'
                ? 'partial'
                : 'accepted',
        retryReason:
          payload.newsStatus === 'unavailable'
            ? 'source failure'
            : 'request spacing',
        context: payload.place?.label || payload.newsQuery || state.context,
        status:
          payload.newsStatus === 'unavailable'
            ? 'unavailable'
            : payload.status === 'stale'
              ? 'stale'
              : payload.status === 'partial'
                ? 'degraded'
                : rows.length
                  ? 'nominal'
                  : 'empty',
        error:
          payload.newsStatus === 'unavailable'
            ? 'News source unavailable; other feeds may still be available.'
            : null,
        retryAt: now() + (payload.newsStatus === 'unavailable' ? 30000 : 5000),
      };
      emit();
    } catch (error) {
      if (destroyed || signal.aborted || token !== epoch) return;
      state = {
        ...state,
        status: state.rows.length ? 'stale' : 'unavailable',
        lastOutcome: 'failed',
        retryReason: error.status === 429 ? 'rate limit' : 'source failure',
        error:
          error.status === 429
            ? 'News requests are rate limited.'
            : 'News is unavailable. Try again after the cooldown.',
        retryAt:
          now() + Math.max(30000, Math.min(300000, error.retryAfterMs || 0)),
      };
      emit();
    }
  }
  return {
    load(point) {
      return run(
        `region:${point.lat.toFixed(1)},${point.lon.toFixed(1)}`,
        `${point.lat.toFixed(2)}, ${point.lon.toFixed(2)}`,
        (signal) => service.getBrief(point.lat, point.lon, { signal }),
      );
    },
    search(query) {
      return run(`search:${JSON.stringify(query)}`, 'Topic search', (signal) =>
        service.searchNews(query, { signal }),
      );
    },
    cancel() {
      ++epoch;
      request?.abort();
      if (state.status === 'loading') {
        state = {
          ...state,
          status: state.rows.length ? 'stale' : 'disabled',
          lastOutcome: 'cancelled',
        };
        if (!destroyed) emit();
      }
    },
    destroy() {
      destroyed = true;
      ++epoch;
      request?.abort();
    },
  };
}
