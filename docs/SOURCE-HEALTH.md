# Satellite source health

The core CelesTrak groups and optional Starlink shell now retain the proxy's
`STALE-ERROR` provenance. A successful HTTP response containing a fallback copy
is usable data, but is not reported as nominal source health.

The existing satellite row shows a cache-provenance label. Its tooltip provides:

- **Core attempt**: when the browser last started its core catalog request batch.
- **Core accepted**: when a batch last supplied usable core catalog data, including
  a fallback copy. This is receipt time, not an upstream refresh success.
- **Oldest cache acquisition**: the oldest known successful proxy acquisition
  among accepted groups and the active Starlink shell. Unknown timestamps stay
  unknown. This is not the TLE orbital-element epoch or a position observation.

The proxy retains the original acquisition timestamp across memory hits, disk
reloads and upstream-failure fallback. Repeatedly serving a cached body does not
advance its acquisition time. Propagating satellite positions to the current
clock also does not refresh the underlying source data.

Layer stats expose `lastAttempt`, `lastSuccess` (core batch acceptance),
`cacheFetchedAt`, `staleGroups` and `failedGroups`. `lastUpdate` uses the oldest
known accepted core acquisition, or null when that time is unknown. These
satellite-specific fields do not establish a common contract for every source.

A complete core outage preserves the last catalog, cache age and acceptance time,
while reporting unavailable. A partial outage reports degraded and lists failed
groups. Cached fallback groups report stale/degraded; a subsequent clean refresh
clears those warnings. Disabling the dense shell removes its provenance from the
active catalog's health. Existing catalog, tracking and retry behavior is retained;
no new automatic retry loop or provider requests were added.

## Verification

`src/layers/satellites/health.test.mjs` exercises actual core and dense ingestion,
outage retention, clean recovery, cancellation, timestamp validation and mixed
provenance. `server/providers/space/celestrak.test.mjs` runs the real middleware
with controlled transport/time and temporary disk storage to verify acquisition
metadata on fresh, hit, stale, disk-reloaded and unavailable responses. Existing
proxy error-sanitization tests are retained.

Browser appearance, pointer operation, native GPU behavior and live CelesTrak
availability require separate acceptance. Fixture tests do not establish those.

## Shared manager update history

Every registered layer now exposes a separate `stats.refreshHealth` envelope:

| Field            | Meaning                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `lastAttempt`    | Start of the most recent manager-owned `update()` call                                     |
| `lastCompletion` | Settlement time, including failure or cancellation                                         |
| `lastSuccess`    | Most recent completion without a reported failure or degraded/stale/partial/fallback state |
| `outcome`        | `never`, `pending`, `completed`, `degraded`, `failed` or `cancelled`                       |

The envelope covers the initial update during activation, scheduled refreshes and
explicit manager refreshes. It does not observe requests inside a layer's
independent polling loop, WebSocket messages, per-frame propagation or a provider's
internal cache refreshes. A successful completion means the layer reported no
problem; it is not evidence of a new upstream acquisition. Missing source
metadata remains unknown. The manager does not alter `lastUpdate` or provider
cache timestamps, and it does not add requests, timers or automatic retries.

Attempt history lasts for the registration's session and remains visible when a
layer is disabled. Skipped refreshes do not count as attempts. Cancelled or
superseded work cannot replace the history of a newer refresh. Failures and
degraded completions preserve the previous successful-completion timestamp.
The snapshot envelope carries a copy of this history so consumers cannot mutate
the manager's state.

Hover over a layer's existing source/status line for manager timestamps and the
reported source timestamp. Existing `retryAt` and `retryInSec` values pass through
snapshots when finite and valid; the tooltip shows those supplied values, or
unknown. A layer's regular polling interval is not presented as a source retry
promise. Provider-specific retry behavior is unchanged.

## Monitoring request details

The monitoring panel shows USGS manager attempts and successful completion beside
its existing data timestamp. News separately reports the last actual request
attempt, accepted response time, original source snapshot timestamp and outcome.
Receiving a stale fallback does not make the original source timestamp newer.
Rejected or cancelled work does not advance the accepted-response time.
Changing query clears the previous query's accepted-response metadata along with
its rows. Calls blocked by cooldown do not become attempts.

News cooldown reasons distinguish normal request spacing, source failure and
rate limiting. The displayed deadline is when the user may request again; it does
not schedule an automatic request. Existing cooldown bounds and late-response
rejection remain in place.

## Aircraft snapshot-request history

Aircraft stats and layer snapshots now expose a copied `acquisitionHealth`
envelope, independent of manager-owned `refreshHealth`:

| Field          | Meaning                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| lastAttempt    | Start of an actual call to the configured source adapter's getSnapshot          |
| lastCompletion | Settlement of the most recent request, including failure/cancellation           |
| lastAccepted   | Most recent accepted snapshot for this request history, including degraded data |
| lastSuccess    | Most recent acceptance without the source's stale/unknown-freshness flag        |
| outcome        | never, pending, accepted, degraded, failed or cancelled                         |

A call skipped during existing backoff, or aborted before acquisition, does not
change this history. A failed/cancelled call preserves accepted/clean times;
a stale or unknown-freshness snapshot advances accepted time but not clean time.
New attempts retain earlier settled times while pending. The latest attempt owns
telemetry publication; an older completion cannot replace it. Public stats and
snapshots return copies. Layer initialization resets this source-history lifetime.

This observes adapter calls made through aircraft ingestion, including direct
refreshes outside the manager. It does not measure individual fallback-provider
requests inside an adapter, validate upstream timestamps, or turn cached data into
a new upstream acquisition. Original source observation time remains lastUpdate.
The existing retry deadline is exposed as retryAt alongside retryInSec; it is not
a new retry promise or timer. Hover the aircraft source/status line to compare
request acceptance, manager completion, source age and retry information.

### Initial coverage inventory

This is the first scoped inventory, not an audit of every layer family.

| Path                                               | Ownership / existing evidence                                                                                                                                         | Status / remaining work                                                                                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aircraft ingestion and military-filter change hook | src/layers/flights/ingestion.js; tracking.js calls flightsLayer.update directly when military filtering changes                                                       | Request history now covers both direct and manager calls. Provider-level fallback subrequests remain outside it.                                    |
| AIS vessel snapshots / server transport            | src/layers/vessels/ingestion.js and queries.js already expose transportStatus, lastMessageAt and retryInSec; src/data/aisWatchdog.js owns transport watchdog behavior | Preserve message time versus position/data time. Connection-attempt history is a later slice; no new socket loop added.                             |
| Bike-share proximity activation                    | src/layers/bikeshare/viewport.js camera debounce can activate cities separately from normal update; ingestion.js owns refresh                                         | Existing per-city failure/staleness handling retained. Per-city request-history assessment remains open.                                            |
| Canadian AQHI                                      | src/layers/airQuality/index.js owns cancellable updates; source.js bounds acquisition                                                                                 | Existing observed-time/error status retained; no new independent polling loop identified in this inspected module.                                  |
| Satellite core and optional dense shell            | src/layers/satellites/ingestion.js and catalog.js                                                                                                                     | Existing core/dense acceptance and original proxy-cache provenance retained. Per-group request timeline remains outside the common manager history. |
| Monitoring news and configured RSS/Atom            | src/monitoring/news.js plus server/providers/monitoringFeeds.js                                                                                                       | Existing explicit request ownership/cooldown and server per-feed cache timing retained. Browser acceptance is not server upstream acquisition.      |

### Increment acceptance

Enable aircraft and inspect its source/status tooltip. On a successful adapter
response, snapshot request outcome becomes accepted or degraded; source timestamp
retains the adapter's observation time. During a reported retry interval, skipped
updates must not advance attempt time. Confirm usual tracking and military-filter
interactions still work. Use fixture tests for deterministic stale/error/cancelled
cases rather than provoking live provider outages. This increment requires a new
validation run; the user's previous all-green report predates it.
