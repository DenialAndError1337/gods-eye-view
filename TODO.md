# Monitoring milestones

Latest work: see **Upstream reconciliation — pinned candidate** below.

## Milestone 1 — implementation and verification snapshot

Approved 2026-10-15: an opt-in monitoring panel using existing USGS and regional-news
services, shared filters/details and map/list selection, and the partial-feed
provenance correction. Implementation is complete. Browser visual acceptance and
allocation measurements still need a compatible host.

Baseline: `fd8f5924cdccce04a8896f2f2bdf76dd7b72df98`.

| Work                                                 | Verification status | Evidence                                                                                                                                                                                               |
| ---------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Common event projection, filters and selection       | Pass                | `src/monitoring/monitoring.test.mjs`: nullable metadata, stable IDs, source/category/time/antimeridian filters, selection refresh/removal                                                              |
| Opt-in panel, synchronized list/details, close/reset | Pass (controller)   | `src/ui/monitoringPanel.test.mjs`: real controller with the existing instrumented rail DOM; subscriptions/timers released and map filter removed                                                       |
| Earthquake map bridge, emphasis and snapshot reuse   | Pass (layer)        | `src/layers/earthquakes/ownership.test.mjs`: visibility/overlay filtering, no extra fetch, selection identity and emphasis survive refresh, close restores display                                     |
| Regional news and failure isolation                  | Pass                | Monitoring tests cover superseded/uncooperative responses, cancellation, region changes, empty results, retained stale data and rate-limit cooldown; request-service regression covers 429/Retry-After |
| Partial-feed provenance correction                   | Pass                | `src/data/layerSnapshot.test.mjs`: partial-only and mixed nominal/partial cohorts retain partial status                                                                                                |
| Full ordinary suite                                  | Pass                | 6,738 tests: 6,737 passed, 1 skipped, 0 failed; 52.22 seconds. Writable workspace TMPDIR and concurrency 8; two allocation probes excluded using the existing runner's plan                            |
| Production build                                     | Pass                | `npm run build`: 12.26 seconds; existing large-chunk warnings remain                                                                                                                                   |
| Adopted formatting                                   | Pass                | `npm run format:check`: 1,371 source files; new modules and QA script also formatted                                                                                                                   |
| Import/package boundaries                            | Pass                | `npm run check:boundaries`                                                                                                                                                                             |
| Layer-token compatibility                            | Pass                | `npm run layer-token:check -- --base-ref HEAD`: 30 published, 0 new tokens                                                                                                                             |
| Whitespace and browser script syntax                 | Pass                | `git diff --check`; `node --check scripts/qa-monitoring.mjs`                                                                                                                                           |
| Allocation probe command                             | Fail (environment)  | `node --expose-gc --test --test-concurrency=1 src/data/focusAllocations.test.mjs`: baseline `ENOENT`, `uv_resident_set_memory`; budget not measured. Second allocation probe not run                   |
| Real browser fixture gate                            | Needs follow-up     | `scripts/qa-monitoring.mjs` attempted with Chromium 153; process exits before opening a page. No browser assertions, screenshot, layout or GPU acceptance are claimed                                  |
| Live providers / native GPU / prolonged monitoring   | Needs follow-up     | Fixture/controller tests are not evidence of current upstream availability or long-duration GPU performance                                                                                            |

## Changes

- `src/monitoring/events.js`, `store.js`, `news.js`: common nullable records,
  transient filtering/selection, and explicit regional-news request ownership.
- `src/ui/monitoringPanel.js`, `styles/monitoring.css`: MONITOR launcher, shared
  filters, chronological paged list, source status and common details using
  existing keyed list/card controls. Explicit navigation; news stays unlocated.
- `src/standalone/monitoring.js`, `data.js`: standalone mounting, lifecycle,
  accepted earthquake snapshot access, map selection and camera-policy bridge.
- `src/layers/earthquakes/index.js`, `records.js`: accepted snapshot projection,
  map filter/selection emphasis, stable synthetic identities and retained source URLs.
- `src/data/layerSnapshot.js`: complete the partial-status vocabulary and severity.
- `src/services/requests.js`: retain HTTP status/Retry-After on service errors.
- Focused regression tests, `scripts/qa-monitoring.mjs`, `docs/MONITORING.md`,
  README entry and this checklist.

## Verification details

The successful ordinary-suite command uses the repository's discovery/partition
logic, without changing its allocation policy:

```sh
# Set TMPDIR to an existing writable local directory for this restricted host.
node --input-type=module - <<'JS'
import { discoverUnitTestFiles, buildUnitTestPlan } from './scripts/run-unit-tests.mjs';
import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, [
  '--test', '--test-concurrency=8',
  ...buildUnitTestPlan(discoverUnitTestFiles()).parallel,
], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
JS
```

An initial unrestricted-concurrency `npm test` attempt exited before producing a
summary. A subsequent ordinary run exposed fixture failures from missing `/tmp`;
using a writable TMPDIR resolved them. Regression review also caught the existing
requirement for Cyber to remain the final stylesheet. The stylesheet order was
corrected; final theme tests and the full ordinary suite pass. No assertion was
weakened to hide that regression.

## Remaining acceptance and backlog

1. On a host where Chrome can start, run the fixture browser gate documented in
   `docs/MONITORING.md`. Verify desktop/narrow layouts, actual pointer picking on
   quake geometry, tracking/navigation and weather/share interactions visually.
2. Run `npm test`, including both serialized allocation probes, on a host that
   supports Node's memory measurements. Preserve the allocation thresholds.
3. If desired, exercise live keyless news/USGS operation and a longer monitoring
   session. Record actual results before marking browser/live acceptance Pass.
4. Milestone 2 topic-search/filter slice is now implemented; see current increment
   below. Satellite stale-cache propagation (baseline B2) is implemented in the source-health increment below.

No new providers, keys, persistent monitoring archive, alerts or public deployment
were introduced. Monitoring filters are transient and are not part of share links.

## Current increment — geopolitical news search (2026-10-15)

Authorized by the request to tackle the next TODO items. The scope is explicit
topic/phrase/region searches through the existing Google RSS and GDELT providers,
with loaded keyword and publisher filtering. No ReliefWeb registration or new
provider credentials were introduced.

| Item                                           | Verification status                     | Evidence                                                                                                                                                         |
| ---------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Topic query validation and bounded acquisition | Pass                                    | `server/providers/monitoringNews.test.mjs`: allowed topics/providers/windows, bounded plain-text terms, fixed source hosts, malformed/empty responses, cap of 25 |
| Endpoint reliability                           | Pass                                    | Tests cover validation before acquisition, per-query coalescing, cache hits, distinct-query cooldown, stale fallback, stale expiry and sanitized failures        |
| Loaded keyword and publisher filters           | Pass                                    | Monitoring model and UI-controller tests confirm shared filtering/reset without network calls                                                                    |
| Topic/region query request ownership           | Pass                                    | Cancellation/late completion and partial-provider regressions; HTTP service preserves query encoding and cancellation                                            |
| Full ordinary suite                            | Pass                                    | 6,747 tests: 6,746 passed, 1 skipped, zero failed; 49.80 seconds. Writable TMPDIR and concurrency 8, using the existing allocation exclusion plan                |
| Formatting and architecture boundaries         | Pass                                    | `npm run format:check` and `npm run check:boundaries`                                                                                                            |
| Layer-token compatibility                      | Pass                                    | 30 published, zero new allocations against HEAD                                                                                                                  |
| Production build                               | Pass                                    | `npm run build`: 834 modules, built in 9.05 seconds; existing large-chunk warnings remain                                                                        |
| Live USGS adapter                              | Pass (point-in-time)                    | Actual adapter returned 40 valid M2.5+ records with valid coordinates                                                                                            |
| Live topic API                                 | Pass (point-in-time)                    | Same-session Vite HTTP request: HTTP 200, 23 diplomacy reports, Google News RSS                                                                                  |
| Live existing regional API                     | Pass (point-in-time)                    | Same-session HTTP request for Brussels: HTTP 200, 5 reports, Google News RSS                                                                                     |
| GDELT availability                             | Needs follow-up                         | Direct API request hit the 12-second deadline on this host; no availability claim                                                                                |
| ReliefWeb evaluation                           | Pass (assessment); integration deferred | Official API requires an approved appname; read-only unapproved-name probe returned 403. No registration was submitted                                           |
| Browser acceptance                             | Needs follow-up                         | Cloud browser could not reach the session-local loopback server; existing local Chromium cannot start. No visual/GPU acceptance claimed                          |
| Both serialized allocation suites              | Fail (environment)                      | Focus probe and 13 overlay workloads attempted; all hit `uv_resident_set_memory` ENOENT. Thresholds and tests are unchanged                                      |

### Files added/extended in this increment

- `src/monitoring/newsQuery.js`: validated topic vocabulary and bounded text terms.
- `server/providers/monitoringNews.js` and its tests: explicit local search endpoint,
  cache/coalescing/cooldowns and existing-provider acquisition.
- `server/providers/local.js`: register the endpoint. Regional RSS normalization is
  reused without changing the cockpit's five-row behavior.
- Monitoring state/controller/UI and HTTP request services: topic queries, local
  keyword/publisher filters, cancellation and readable partial outcomes.
- Documentation and existing source-attribution inventory updated. Provider decisions
  and observed live checks are in `docs/NEWS-SOURCES.md`.

### Next work

1. Complete real browser, pointer-pick, narrow-screen, native-GPU and longer-session
   acceptance on a compatible host; do not infer that from unit or HTTP checks.
2. Shared manager refresh history is now implemented below. Source-specific
   acquisition/retry telemetry for independent loops remains follow-up.
3. Evaluate canonical publisher-link handling, source configuration and syndication
   grouping before calling the reporting workflow complete. Region text continues
   to be search context, not incident geography.
4. ReliefWeb remains optional and waits for an approved application identity.
   Event correlation, historical archives, alerts and automated reports remain
   later scope.

Delivery is a cumulative overlay ZIP against the original baseline, also suitable
for installation over the first milestone ZIP. No dependency/lockfile or secrets
are included, and no files need deleting.

## Current increment — satellite source health (2026-10-15)

Corrected baseline B2: core satellite ingestion discarded the source's stale flag
and restamped cached data as fresh; the optional Starlink shell also lost that
provenance. Both now retain it. CelesTrak responses include the original proxy
acquisition time, retained across cache hits, stale fallback and disk reloads.
The existing row provides attempt/acceptance/cache timestamps with explicit
unknowns. Cache acquisition is not the orbital-element epoch.

| Item                                                 | Verification status           | Evidence                                                                                                                                            |
| ---------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core stale provenance, outage retention and recovery | Pass                          | Actual ingestion regression tests preserve old age/catalog on failure and clear warnings on recovery                                                |
| Dense Starlink provenance and removal                | Pass                          | Actual dense loader test verifies stale acceptance and removal from active health                                                                   |
| Proxy acquisition timestamp                          | Pass                          | Real middleware tests cover fresh, hit, stale, disk reload and no-cache failure                                                                     |
| Metadata validation and cancellation                 | Pass                          | Missing/malformed/future timestamps stay unknown; cancelled batch releases controllers                                                              |
| Existing proxy errors                                | Pass                          | All 20 proxy-error regressions pass without weakening assertions                                                                                    |
| Full ordinary suite and build                        | Pass                          | 6,752 tests: 6,751 passed, 1 skipped, zero failed; 53.98 seconds. Production build: 835 modules, 10.82 seconds; existing chunk-size warning remains |
| Formatting, boundaries and tokens                    | Pass                          | format:check (1,374 files), check:boundaries (health module registered), 30 published/zero new tokens, git diff --check                             |
| Browser/GPU and live CelesTrak acceptance            | Needs follow-up               | No new browser or live-provider acceptance claimed                                                                                                  |
| Serialized allocation probes                         | Fail (environment, unchanged) | Previous ENOENT memory-measurement limitation remains; not rerun for this increment                                                                 |

Implementation and semantics: `docs/SOURCE-HEALTH.md`. No dependencies, new provider
accounts, background retry loops or public deployment were introduced. Shared manager refresh metadata is implemented in the next increment below;
canonical publisher links and syndication grouping remain in the news backlog.

## Current increment — shared refresh history (2026-10-16)

Added common manager-owned update history across registered layers, including
activation, scheduled refresh and explicit refresh. Attempts, completion and last
clean completion stay separate from each layer's source-data timestamp. Degraded,
stale, partial and fallback results do not advance clean completion. Existing
independent source loops and upstream caches retain their own health contracts.

Monitoring now exposes USGS update history and news attempt/acceptance/source
snapshot times. News cooldowns explain request spacing, rate limiting or failure.
Explicit source retry metadata passes through snapshots without inventing retry
promises for sources that do not report it.

| Item                                       | Verification status     | Evidence                                                                                                                                |
| ------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Shared history and recovery                | Pass                    | Manager tests cover activation, clean/degraded/stale/partial/fallback/unavailable/failed updates, skipped requests and retained success |
| Cancellation and ownership                 | Pass                    | Invalidated work cannot overwrite a newer refresh; history objects are copied for presentation                                          |
| Snapshot age and retry metadata            | Pass                    | Tests preserve source age, copy history and reject invalid retry values                                                                 |
| News provenance and cooldown               | Pass                    | Actual client tests retain fallback acquisition age, record attempts/acceptance and avoid acquisition during cooldown                   |
| Existing layer and monitoring presentation | Pass (controller/model) | 148 focused tests pass, including status metadata and existing UI controllers                                                           |
| Full ordinary suite                        | Pass                    | 6,758 tests: 6,757 passed, 1 skipped, zero failures; 47.93 seconds. Existing ordinary-runner plan, concurrency 8 and writable TMPDIR    |
| Formatting, boundaries and tokens          | Pass                    | format:check (1,374 files), check:boundaries, 30 published/zero new tokens; git diff --check                                            |
| Production build                           | Pass                    | npm run build: 835 modules, 9.13 seconds; existing chunk-size warning remains                                                           |
| Browser/GPU and allocation acceptance      | Needs follow-up         | Previous host limitations remain; no new acceptance claimed                                                                             |

Details and limits are documented in `docs/SOURCE-HEALTH.md`. No new dependencies,
credentials, automatic retry loops, git push or deployment were introduced.

### Next work after this increment

1. Source-specific acquisition timestamps and health for independently polling or
   streaming layers, where their existing contracts support it. Shared manager
   history alone does not complete per-provider telemetry.
2. Canonical publisher-link handling, source configuration and syndication
   grouping for news. Keep reporting distinct from corroboration.
3. Browser/pointer/narrow-screen/native-GPU and longer-session acceptance, plus
   allocation measurements, on a compatible host.
4. ReliefWeb integration still requires an approved application identity.

## Upstream reconciliation — pinned candidate (2026-10-16)

Reconciled all four custom milestones against upstream
`537e99dfa45a3f7b239ad6230a65be658b3ea29d` in a separate checkout. The original fork
and working source remain intact. See `docs/UPSTREAM-RECONCILIATION.md` for the
verified comparison, feature decisions, conflicts and update workflow.

The fork was 165 commits / 20 mainline merges behind at the observed tips.
Upstream changed 161 paths; six overlap the 44 customization files. Four text
merges were clean; CelesTrak transport and adjacent panel tests were reconciled
without dropping either behavior. No monitoring or news capability was removed.

| Work                             | Status             | Evidence                                                                                                                                                   |
| -------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact ancestry and file overlap  | Pass               | Completed Git history, pinned tips, three-way per-file comparison                                                                                          |
| Reliability TODO reassessment    | Pass               | Adopt upstream per-city bike-share recovery/staleness, provider body caps, GBFS/OpenSky rate-limit improvements; do not duplicate them                     |
| Conflict behavior                | Pass               | 54 focused tests cover both CelesTrak changes and both panel changes                                                                                       |
| Full candidate regression gates  | Pass               | 7,107 ordinary tests: 7,106 pass, 1 skip, zero failures; build 849 modules/12.54s; format 1,407 files; boundaries; 31 upstream tokens/zero new; diff check |
| Both serialized allocation gates | Fail (environment) | Focus probe and all 14 overlay workloads attempted; ENOENT uv_resident_set_memory; no budgets measured or assertions relaxed                               |
| Browser/GPU/live acceptance      | Needs follow-up    | No new runtime/browser acceptance inferred from source comparison                                                                                          |

Next: publisher-link provenance, source configuration and syndication grouping.
Per-provider telemetry for independent loops remains partial; bike-share failure
recovery and response-size caps are now upstream capabilities. Work against this
pinned integration, review upstream regularly, and update with tests rather than
chasing every commit.
