/** Proxy acquisition times describe cache age, never the orbital element epoch. */
export function catalogHealth(results, now = Date.now()) {
  const accepted = results.filter((result) => result.ok);
  const failedGroups = results
    .filter((result) => !result.ok)
    .map((result) => result.path);
  const staleGroups = accepted
    .filter((result) => result.stale)
    .map((result) => result.path);
  const times = accepted.map((result) => result.fetchedAt ?? null);
  return {
    failedGroups,
    staleGroups,
    fetchedAt:
      times.length && times.every((at) => Number.isFinite(at))
        ? Math.min(...times)
        : null,
    acceptedAt: accepted.length ? now : null,
  };
}

export function satelliteHealthStats(state) {
  const core = state._coreHealth;
  const dense = state._params.catalog === 'dense' ? state._denseHealth : null;
  const staleGroups = [
    ...(core?.staleGroups || []),
    ...(dense?.staleGroups || []),
  ];
  const failedGroups = core?.failedGroups || [];
  const stale =
    staleGroups.length > 0 || (failedGroups.length > 0 && state._count > 0);
  const times = [core, dense].filter(Boolean).map((health) => health.fetchedAt);
  return {
    lastAttempt: state._lastAttempt,
    lastSuccess: core?.acceptedAt ?? null,
    cacheFetchedAt:
      times.length && times.every((at) => Number.isFinite(at))
        ? Math.min(...times)
        : null,
    staleGroups,
    failedGroups,
    stale,
    status:
      state._lastError === 'CelesTrak unreachable'
        ? 'unavailable'
        : state._lastError || stale
          ? 'degraded'
          : 'nominal',
    error:
      state._lastError ||
      (staleGroups.length
        ? `Cached TLE fallback: ${staleGroups.join(', ')}`
        : null),
  };
}
