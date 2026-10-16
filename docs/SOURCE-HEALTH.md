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

| Path                                               | Ownership / existing evidence                                                                                                                                         | Status / remaining work                                                                                                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aircraft ingestion and military-filter change hook | src/layers/flights/ingestion.js; tracking.js calls flightsLayer.update directly when military filtering changes                                                       | Request history now covers both direct and manager calls. Provider-level fallback subrequests remain outside it.                                                                   |
| AIS vessel snapshots / server transport            | src/layers/vessels/ingestion.js and queries.js already expose transportStatus, lastMessageAt and retryInSec; src/data/aisWatchdog.js owns transport watchdog behavior | Preserve message time versus position/data time. Watchdog connection-attempt/handshake/failure history is now exposed end to end (see below); no new socket loop added.            |
| Bike-share proximity activation                    | src/layers/bikeshare/viewport.js camera debounce can activate cities separately from normal update; ingestion.js owns refresh                                         | Existing per-city failure/staleness handling retained. Per-city information/status adapter history is now exposed (see below); reported feed-update timestamps are now retained separately (see below). |
| Canadian AQHI                                      | src/layers/airQuality/index.js owns cancellable updates; source.js bounds acquisition                                                                                 | Existing observed-time/error status retained; no new independent polling loop identified in this inspected module.                                                                 |
| Satellite core and optional dense shell            | src/layers/satellites/ingestion.js and catalog.js                                                                                                                     | Existing core/dense acceptance and original proxy-cache provenance retained. Per-group request timeline remains outside the common manager history.                                |
| Monitoring news and configured RSS/Atom            | src/monitoring/news.js plus server/providers/monitoringFeeds.js                                                                                                       | Existing explicit request ownership/cooldown and server per-feed cache timing retained. Browser acceptance is not server upstream acquisition.                                     |

### Increment acceptance

Enable aircraft and inspect its source/status tooltip. On a successful adapter
response, snapshot request outcome becomes accepted or degraded; source timestamp
retains the adapter's observation time. During a reported retry interval, skipped
updates must not advance attempt time. Confirm usual tracking and military-filter
interactions still work. Use fixture tests for deterministic stale/error/cancelled
cases rather than provoking live provider outages. This increment requires a new
validation run; the user's previous all-green report predates it.

## AIS transport event history

The server watchdog now exposes a copied `transportHealth` object through
`/api/vessels`, the normalized vessel snapshot, layer stats and common layer
snapshot. The vessel source/status tooltip shows its fields alongside existing
valid-message time, position-data time and retry timing.

| Field           | Meaning                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| lastAttempt     | Local wall time when the watchdog commissioned its existing connect action                                                    |
| lastOpen        | Local wall time of a handshake belonging to the currently owned socket generation                                             |
| lastFailure     | Local detection/classification time of a retry-triggering failure, close or silence recycle; not the start of a remote outage |
| lastFailureKind | Watchdog retry class: transport, rate-limit or auth; null if unknown                                                          |

A handshake does not prove receipt of AIS data. An accepted AIS message can carry
metadata without a current usable position. Neither time replaces lastUpdate or
newestPositionAt. When the watchdog has no recorded event, fields stay null.
Older/custom sources may omit the entire object; no receipt-time fallback is
invented. Frontend normalization validates epochs and allows only these fields
and failure classes. Public snapshots/stats copy the envelope.

History lasts for the server watchdog lifetime and resets on dispose/recreation.
It is not a persistent archive, and browser reload alone need not erase it.
Successful data receipt and credential changes preserve historical failure times;
current status and event chronology must be read together. An auth-failed probe
retains the auth retry classification until credential/data recovery, even if the
probe itself suffers a transport fault. No credential identity is exposed.

Events from retired socket generations cannot advance timestamps. Polling status,
waiting through backoff, missing credentials and unsupported transport do not
become new connection attempts. Retry scheduling still uses the original
monotonic-clock policy; wall timestamps are display evidence and can reflect
clock corrections. This change adds no requests, sockets, timers or retries.

### AIS acceptance

After applying this increment, stop/restart the local dev server. With your normal
AIS configuration, enable vessels and inspect the source/status tooltip. Compare
connection attempt, handshake, last valid message, original position-data time
and source retry. A healthy connection alone must not make position data newer.
If no AIS source is configured, record live acceptance as BLOCKED rather than
adding credentials just for this check. The offline fixtures cover missing keys,
backoff, silent peers, orphan handlers, failure classes and recovery without a
live AISStream account. Preserve your current manual results and add a new dated
validation entry for this increment.

## Bike-share city request history

`stats.cityAcquisitionHealth` and common layer snapshots provide one entry per
city that has attempted an information or status request in this layer lifetime.
Each entry has cityId/city labels, current active/failed flags and separate
information/status channel objects (null when never requested).

| Channel field  | Meaning                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| lastAttempt    | Local start of an actual configured GBFS adapter call                                                        |
| lastCompletion | Local acceptance, failure or cancellation time; retained from the prior request while a newer one is pending |
| lastAccepted   | Most recent locally parsed and cached response; preserved after failure/cancellation                         |
| outcome        | pending, accepted, failed or cancelled                                                                       |

An information cache hit or coalesced caller reuses existing history. Empty
status maps retain their existing parser semantics; accepted means that local
normalization/cache commit succeeded, not that availability is independently
verified. Per-city/channel records do not overwrite neighbouring histories.
The collection is bounded by the registered city IDs, currently 52, and resets
with init. Disable and moving away retain history while changing active/failed
flags. Cached metadata may therefore have an older accepted time on reactivation.

The bike-share source/status tooltip shows up to eight active/failed city entries,
prioritizing failed cities and stating when more current entries exist. Each city
shows both channels' outcome and timestamps; never-requested channels are explicit.
Public stats and shared snapshots copy rows and both nested channel objects.

These are adapter timings. The original layer lastUpdate and status-cache timestamp
are local acceptance/refresh times; they are not operator publication time or a
station's last_reported. Stats/snapshots now state lastUpdateMeaning as
local-acceptance, and the tooltip labels that timestamp accordingly. Operator feed
update claims are retained separately as described below. Source-age classification
and retry behavior are unchanged.

Cancellation settles local callers and releases their loading reference once,
even if a custom source ignores abort. Such late results cannot write either
cache or supersede a new request/lifetime's history. This does not forcibly stop
an uncooperative source transport. Existing source calls, caching, coalescing,
proximity activation and scheduled polling are retained; no extra polling loop.

### Bike-share acceptance

After applying the update and restarting the dev server, enable Bike Share near a
registered city at its normal activation altitude. Inspect its source/status
tooltip for separate information and status histories. Re-entering a cached city
must not invent another information request; a normal status refresh can advance
its own attempt/acceptance time. Moving away or disabling must clear loading
without later cancelled responses overwriting newer state. Use deterministic
fixtures for ignored-abort/failure conditions rather than forcing live outages.
Treat absent/out-of-range cities or provider outages as the actual observed
condition; do not mark a live-source check passed without accepted data.

## GBFS reported feed update and cache assessment

Each accepted information/status channel now retains `operatorUpdatedAt` in epoch
milliseconds from that document's top-level `last_updated`. This is the operator's
reported feed-update time, shown separately from attempt/completion/local acceptance.
It is not a station's `last_reported`, a verified observation, or proof of a fresh
network acquisition. The [GBFS v2.3 reference](https://github.com/MobilityData/gbfs/blob/v2.3/gbfs.md)
uses integer Unix seconds; the [GBFS v3 reference](https://gbfs.org/documentation/reference/)
uses RFC3339 timestamps. Both representations are accepted without changing the
existing station parser or requiring an asserted version to be trusted.

Missing, invalid, numeric-string, out-of-range numeric (including contemporary millisecond values) and unsupported
leap-second timestamps remain unknown. Explicit timezones and valid calendar dates
are required for strings. Numeric seconds must be positive safe integers within
year 9999; string input is bounded to 64 characters and normalized to milliseconds.
Submillisecond precision is limited by JavaScript Date. A future operator clock
claim is displayed as reported, not corrected to the browser clock or treated as
evidence of freshness. No new stale threshold, severity rule or retry is introduced.

Cache hits for session-static information keep the same operator time. Failed or
cancelled requests retain the last accepted document's claim. A newly accepted
document with no valid timestamp clears that channel's claim to unknown, rather
than attaching an earlier document's time to new data. Retired requests cannot
advance it. Stats and shared snapshots copy the scalar with each channel.

### Verified cache boundaries in this checkout

| Boundary | Inspected implementation | What it establishes |
| --- | --- | --- |
| Layer information cache | src/layers/bikeshare/ingestion.js | Per-city session reuse; no new adapter attempt or operator update |
| Layer status cache | same module | Local acceptance time for fallback/rendering; not remote publication |
| GBFS proxy | server/providers/gbfs.js | Each admitted middleware request calls fetchGbfsUpstream; no application memory/disk response cache in this route |
| HTTP response policy | src/data/gbfsSource.js, gbfsCacheControl | station_information responses allow public max-age=300; other supported paths use no-store |
| Proxy marker | server/providers/gbfs.js | X-GBFS-Cache is a literal MISS; a replayed HTTP-cached response can retain it, so it does not prove a new upstream acquisition |

The proxy relays the body without adding a successful-upstream-acquisition epoch.
The browser adapter currently returns only the document, not response-header
provenance. Consequently upstream acquisition time, upstream CDN cache age and
browser-cache provenance remain unknown; this update does not invent them or
change cache policy. The existing proxy comments still describe an older 15-system
registry; runtime registry size is currently 52 and policy constants are unchanged.

### GBFS timestamp acceptance

Enable Bike Share near a registered city and inspect its source/status tooltip.
Compare information/status operator feed update claims with local acceptance.
An information cache hit must not advance either time; a normal status refresh may
advance acceptance while an unchanged last_updated remains unchanged. Unknown
operator time is a valid disclosed outcome, not an implicit receipt-time fallback.
Use fixtures for malformed, missing, cancelled and failing documents. This does
not replace native browser/live provider acceptance.

## Catalog-wide inventory and CCTV maintenance time

The [source inventory](SOURCE-INVENTORY.md) accounts for all 32 current catalog
IDs and identifies manager, camera, selection, user and derived-data boundaries.
It records source-code evidence, timestamp meanings and prioritized gaps rather
than claiming every layer now has independent acquisition telemetry.

CCTV lastUpdate advances during its existing maintenance update. That update
checks health/geometry/auto-hop and does not establish when a frame was acquired.
CCTV stats now mark it `lastUpdateMeaning: local-maintenance`. The shared snapshot
retains that timestamp and meaning, but returns null ageSec and ageLabel so a
maintenance heartbeat cannot become a source/frame-age claim for HUD/voice users.
The layer source row says **frame age unknown**; its tooltip labels the maintenance
time explicitly. Loading/error precedence and existing feed-state classification
remain unchanged. ON still means the layer's existing nominal state, not a claim
that a particular frame is recent. No frame timestamp, retry, polling interval or
new acquisition is introduced. Catalog/health/frame histories remain follow-up work.

## Independent military-aircraft request history

The military layer now supplies its own copied acquisitionHealth envelope with
the same lastAttempt, lastCompletion, lastAccepted, lastSuccess and outcome fields
as general aircraft. It describes actual calls through military ingestion to the
configured military adapter, including direct update callers. The existing source
line tooltip automatically displays it beside manager history and source time.
The existing military retry deadline is exposed as retryAt as well as retryInSec.
No retry interval, timer, request or fallback policy is added.

A backoff-skipped or pre-aborted call makes no attempt. Pending history retains
earlier settled/accepted times. A response carrying stale or unknown-freshness
evidence advances acceptance but not clean acceptance. Failed/cancelled requests
retain those accepted times. Cancellation is recorded when the awaited adapter
call settles; an abort-ignoring source can therefore leave the caller/history
pending until settlement. No transport can be forcibly stopped by this metadata.

Only the latest actual request owns publication. A superseded success or failure
throws AbortError before changing snapshot, source label, tracking restore, retry
state or current history. Replacing history during initialization retires old
requests. Initialization resets history; ordinary disable retains it. Completion
time is local settlement, and clean acceptance means only that the adapter did
not flag stale/unknown freshness. Neither proves a new upstream acquisition.
lastUpdate still carries the adapter's observedAtMs, including null when unknown.
Provider-level fallback subrequests and military-classification initialization are
outside this military snapshot history. The two aircraft layers remain independent.

### Military acceptance

With the normal military source enabled, inspect source/status details for a
snapshot attempt/outcome and local acceptance beside original source observation
time. A reported retry/backoff period must not invent repeated adapter attempts.
Check normal selection/tracking, disable/re-enable and separate general-aircraft
controls. Use fixtures for overlap, failure and cancellation rather than provoking
live outages. This requires new cumulative validation and browser/live acceptance.
