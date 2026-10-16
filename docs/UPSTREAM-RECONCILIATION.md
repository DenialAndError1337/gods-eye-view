# Upstream reconciliation — 16 October 2026

Your custom dashboard work remains useful. This upstream snapshot is mostly
complementary; updating does not require throwing the dashboard away. Commit
volume is a poor proxy for the amount of custom code that needs adaptation.

## Exact comparison

- Original fork and customization baseline: `fd8f5924cdccce04a8896f2f2bdf76dd7b72df98`.
- Fork remote main observed at that same commit.
- Pinned upstream main: `537e99dfa45a3f7b239ad6230a65be658b3ea29d`.
- Verified ancestry: the original baseline is an ancestor of this upstream.
- After completing the initially shallow history: **165 commits behind**, spanning
  **20 first-parent/mainline merges**. The first shallow-history count was invalid
  for an ahead/behind comparison and is not used here. Commit timestamps on merged
  branches can predate the fork; 165 does not mean 165 commits were authored today.
- Upstream changes **161 paths** between the two pinned trees.
- Our cumulative customization changes/adds **44 files** against the original base.
- Only **six files** overlap. Four merge cleanly as text; two need reconciliation.
- Original working source files and fork remote were left unchanged. Candidate
  integration is isolated in a separate checkout. No push or deployment.

Upstream: https://github.com/bilawalsidhu/gods-eye-view

Pinned comparison:
https://github.com/bilawalsidhu/gods-eye-view/compare/fd8f5924cdccce04a8896f2f2bdf76dd7b72df98...537e99dfa45a3f7b239ad6230a65be658b3ea29d

## What upstream contributes to our TODO

| Area                                                                    | Verified upstream change                                                                                                                                                                                                                                                                  | Decision for our work                                                                                                                                              |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Independent-source reliability                                          | Bike-share health now records per-city failures, clears recovered/out-of-range failures, marks degraded/stale correctly and does not advance freshness when every city poll fails. See `src/layers/bikeshare/{controls,ingestion,lifecycle,viewport}.js` and `failureReporting.test.mjs`. | Adopt; do not implement another bike-share failure-state fix. Per-provider attempt/success telemetry remains incomplete.                                           |
| Bounded provider reads                                                  | CelesTrak now uses a 16 MiB capped body reader; several aircraft, FIRMS and traffic provider reads are bounded as well. See `server/providers/space/celestrak.js`, `src/sources/httpBody.js`, `src/tooling/spaceProviders.test.mjs`.                                                      | Preserve upstream limits. These are complementary to our cache-age reporting.                                                                                      |
| Rate-limit handling                                                     | GBFS retry/backoff and OpenSky 429 response handling are improved. See `server/providers/gbfs.js`, `server/providers/aircraft/opensky.js`, `src/data/gbfsProxyRateLimit.test.mjs`.                                                                                                        | Adopt existing behavior; avoid duplicate backoff loops.                                                                                                            |
| Additional environmental context                                        | A Canadian ECCC AQHI layer provides station observations, bounded requests and explicit observed-time staleness. See `src/layers/airQuality/`.                                                                                                                                            | Adopt as existing upstream capability. It is not worldwide coverage or geopolitical incident data, and it is not automatically added to our monitoring event list. |
| Feed accuracy/coverage                                                  | Cyclone advisory-time acceptance, flights with missing positions, more CCTV/transit/bike-share coverage and Panoramax Street Level support.                                                                                                                                               | Adopt upstream implementation. Keep geographic/inference/attribution limits.                                                                                       |
| Unified monitoring UI and topic news                                    | No upstream replacement for `src/monitoring/`, `src/ui/monitoringPanel.js` or `/api/monitoring-news`. Existing regional news service is unchanged from our original base.                                                                                                                 | Keep our work.                                                                                                                                                     |
| Satellite stale-cache reporting                                         | Upstream satellite layer files are unchanged from the original base. Its proxy body cap does not propagate `STALE-ERROR` or acquisition times into layer health.                                                                                                                          | Keep our satellite fixes and reconcile the proxy transport change.                                                                                                 |
| Shared refresh history                                                  | Upstream `src/data/lifecycle.js` and `src/data/layerSnapshot.js` are unchanged from the original base.                                                                                                                                                                                    | Keep our manager history and explicit freshness limits.                                                                                                            |
| Canonical publisher URLs, configurable sources and syndication grouping | No newly introduced implementation replaces this reporting backlog.                                                                                                                                                                                                                       | Keep as next news work; avoid treating syndicated reports as corroboration.                                                                                        |
| Browser/GPU and performance acceptance                                  | Upstream has additional tests, including an AQHI allocation workload. That does not prove our combined UI has passed browser or GPU acceptance.                                                                                                                                           | Retain acceptance gates; do not mark complete from merge success.                                                                                                  |

These conclusions refer to merged source at the pinned commit. Unmerged PRs and
future changes are not counted as implemented or promised.

## File overlap and resolutions

| File                                | Result                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| DATA_SOURCES.md                     | Clean three-way text merge; still verified by checks                                |
| README.md                           | Clean three-way text merge; still verified by checks                                |
| scripts/package-boundaries.json     | Clean three-way text merge; still verified by checks                                |
| server/providers/space/celestrak.js | Manual reconciliation; retain bounded reads and injected transport/cache provenance |
| src/ui/layerPanel.js                | Clean three-way text merge; still verified by checks                                |
| src/ui/layerPanel.test.mjs          | Manual reconciliation; retain both test cases                                       |

The CelesTrak resolution retains the upstream 16 MiB streaming/body cap and shared
abort signal, while using our injected transport/time/cache seams and original
cache-acquisition response metadata. The panel test resolution retains both the
new upstream Air Quality weather-readout test and our source-health detail test.
A clean text merge is not itself evidence of runtime compatibility.

## Verification of the combined candidate

- Pass: 54 focused tests, including upstream response-size refusal, stale/disk
  cache behavior, both panel changes, GBFS rate limiting and per-city failures.
- Pass: full ordinary suite, 7,107 tests: 7,106 passed, one skipped, zero failures;
  51.98 seconds. Existing ordinary-runner partition with concurrency 8 and a
  writable TMPDIR; serialized allocation gates are reported separately.
- Pass: production build, 849 modules, 12.54 seconds; existing large-chunk warning.
- Pass: formatting (1,407 source files), architecture boundaries, whitespace,
  and layer-token compatibility against the pinned upstream (31 published, zero new).
- Needs follow-up: real browser, pointer picking, responsive layout, native GPU,
  prolonged-session behavior and live-provider availability.
- Fail (environment): both serialized allocation suites attempted, including the
  new upstream air-quality overlay workload. Focus probe and all 14 overlay
  workloads hit `ENOENT: uv_resident_set_memory`; no budgets were measured.
  Thresholds and assertions are not relaxed.

## Keeping the fork maintainable

1. Treat the pinned upstream commit plus a small customization patch as the
   reproducible product version. Do not continually build on a moving main.
2. Keep Git as the source of truth for the custom changes; use ZIPs as the delivery
   format. Commit the patch on a dashboard branch rather than editing GitHub main
   through repeated file replacement.
3. Review upstream on a regular cadence, for example weekly, plus relevant urgent
   fixes. Reconcile in an isolated candidate, run gates, then promote the tested
   snapshot. Fetching a new tip is read-only to the working source.
4. Before each feature increment, check merged upstream changes in the files and
   behavior involved. Wait on a PR only when it demonstrably covers the need and
   waiting is acceptable; do not assume it will merge or solve the whole task.
5. Prefer our existing monitoring modules and composition seams. Edits to shared
   lifecycle, UI and proxy internals deserve focused compatibility checks.

The verified complete-source ZIP should be extracted into a new
folder. It is not an overlay for the old tree: upstream moved two Street Level
files. A clean folder avoids retaining obsolete copies. Preserve the old project
for rollback, copy only your private configuration as needed, run `npm ci`, then
`npm run dev`. The patch supplied beside the ZIP applies only to the pinned
upstream tree and contains the custom changes, not the upstream history.
