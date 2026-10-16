# DONE — implementation history and decisions

Updated 2026-10-16. This file records completed implementation, evidence and
known limits. User acceptance is tracked separately in
[validation results](docs/VALIDATION-RESULTS.md). No laptop validation results
have been supplied for the accumulated updates.

The [original TODO / milestone log](docs/history/IMPLEMENTATION-LOG.md) is
preserved in full, including per-increment test counts, files and earlier backlog
wording. Its “next” sections are historical; current work is in [TODO.md](TODO.md).

## Delivery order and installation context

| Delivery                                | Purpose                                                                  | Installation relationship                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| GEV_MILESTONE_1 through GEV_MILESTONE_4 | Initial custom monitoring and health work                                | Superseded by the reconciled source delivery; do not overlay these old ZIPs again                         |
| GEV_RECONCILED_SOURCE_2026-10-16        | Full source reconciled with upstream                                     | Starting point for the subsequent increments; customization patch applies to pinned upstream commit below |
| GEV_NEWS_PROVENANCE_UPDATE              | Link provenance, related-report groups, remembered provider              | Apply after reconciled source                                                                             |
| GEV_CONFIGURED_RSS_UPDATE               | Operator-configured HTTPS feed sources                                   | Apply after news provenance                                                                               |
| GEV_ATOM_FEEDS_UPDATE                   | Strict Atom/RSS XML parsing, timestamp provenance, custom source filters | Apply after configured RSS; run npm ci because a dependency was added                                     |
| GEV_VALIDATION_CHECKPOINT               | TODO/DONE split, preserved history and validation runbook/results        | Documentation increment after Atom; no application code or dependencies changed                           |

Pinned upstream: `537e99dfa45a3f7b239ad6230a65be658b3ea29d`.
The user reported committing the reconciled customization as `d068dcbd` and
pushing `gev/osint-dashboard`. Later installed commits and acceptance outcomes
have not been confirmed. Never infer installation from delivery alone.

## 1. Shared monitoring panel — 2026-10-15

Implemented an opt-in MONITOR panel with common event records, shared filters,
list/details and earthquake map selection. Earthquake records reuse the existing
accepted USGS snapshot; the panel does not create a duplicate data fetch.
Selection alone does not move the camera; Locate on map is explicit.
Closing the panel releases its map filter. Unknown times, absent coordinates
and partial source status remain explicit.

Tests covered filtering (including antimeridian bounds), selection refresh,
request ownership/cancellation, earthquake rendering ownership and partial-status
projection. Real pointer picking, layout and GPU acceptance remain outstanding.
See [MONITORING](docs/MONITORING.md).

## 2. Topic news acquisition — 2026-10-15

Added explicit local `/api/monitoring-news` searches using existing Google News
RSS/GDELT providers. Bounded query fields, cached/coalesced requests, rate limits,
cooldowns and stale retention protect the endpoint. Keyword/publisher filters
on already-loaded records do not acquire more reports. Region text is query
context; news remains unlocated. The regional cockpit retains its five-row
contract; monitoring returns at most 25 reports per acquisition.

Controller/provider/service tests passed. Earlier point-in-time live checks
returned USGS data and Google-backed topic/regional reports; these do not prove
current availability. GDELT timed out on this host. ReliefWeb requires an
approved appname; an unapproved read-only probe returned 403 and integration
was deferred. See [NEWS-SOURCES](docs/NEWS-SOURCES.md).

## 3. Satellite cache provenance — 2026-10-15

Preserved CelesTrak proxy acquisition time through fresh/hit/stale/disk-cache
paths and through core/dense Starlink ingestion. Cached fallback retains its
original age; all-core failure preserves an accepted catalog and reports the
failure. Acquisition time is distinct from orbital-element epoch, render time
and core acceptance time. Disabling dense data removes its active provenance.

Proxy, ingestion, cancellation and recovery fixtures passed. Live CelesTrak and
visual acceptance remain open. See [SOURCE-HEALTH](docs/SOURCE-HEALTH.md).

## 4. Shared refresh history — 2026-10-16

Added manager-owned attempt, completion and last clean completion metadata.
Degraded/stale/partial/fallback outcomes do not advance clean completion.
Cancelled or superseded work cannot overwrite newer history. Source timestamps
remain separate; retry estimates are shown only when supplied and valid.
Monitoring exposes USGS history and separate news attempt/acceptance/snapshot
information. Independent polling loops and WebSockets are outside this manager
history and still need source-specific assessment.

Manager, snapshot, request and UI-controller regressions passed.

## 5. Upstream reconciliation — 2026-10-16

Reconciled all customizations onto the pinned upstream revision. Completed Git
history showed 165 upstream commits across 20 first-parent mainline merges.
Six changed paths overlapped custom work: four applied cleanly, two needed
manual reconciliation. Preserved upstream CelesTrak's 16 MiB streaming limit
alongside our transport injection/cache metadata; retained both upstream weather
and custom health tests in the layer panel test file.

Upstream supplied additional weather/source-health, coverage and bounded-fetch
work; our monitoring, topic news, satellite provenance and shared history were
still needed. The full reconciled ZIP also accounts for moved street-level
files; copying earlier overlays onto it can reintroduce obsolete files.
See [UPSTREAM-RECONCILIATION](docs/UPSTREAM-RECONCILIATION.md).

## 6. News provenance and report grouping — 2026-10-16

Added explicit link hosts/kinds and safe HTTP(S) URL handling, rejecting embedded
credentials. Google News links remain unresolved aggregator links. GDELT links
are provider-reported, not verified canonical publisher URLs.

Conservative related-report grouping uses normalized comparison URLs or long
normalized headlines with bounded known publication times. Original report rows
and opening URLs remain available. Grouping is heuristic, not corroboration.
Remember provider on this device is explicit opt-in; it stores the provider
choice, not queries, regions, reports or filter state. No automatic search occurs
on reload. Model/controller tests passed; browser acceptance remains open.

## 7. Configured RSS sources — 2026-10-16

Added up to eight operator-configured public HTTPS sources via GEV_NEWS_FEEDS,
metadata-only source inventory and explicit search selection. No feeds are
enabled by default. Server validation, pinned public DNS resolution, redirect
and compression rejection, whole-request deadline and 2 MiB body bounds apply.
Per-feed caches coalesce queries and enforce refresh intervals, including failed
attempts. Bounded stale fallback preserves original freshness.

These sources expose recent feed items, not an archive/topic-search service;
phrase and region matching are literal headline filters. Source freshness uses
the configured interval. Provider/cache/controller fixtures and metadata HTTP
smoke passed. Operator feed availability and licensing remain source-specific.
See [CONFIGURED-RSS](docs/CONFIGURED-RSS.md).

## 8. Atom feeds and shared source filtering — 2026-10-16

Added strict namespace-aware Atom 1.0 parsing and strict configured RSS XML
parsing with pinned server dependency `@xmldom/xmldom` 0.9.12. Supports safe article
links, inherited xml:base and plain-text extraction from text/HTML/XHTML titles.
Published and updated times have distinct labels; missing/invalid times remain
unknown. IDs, self links and enclosure links do not become article links.
DTD/entity declarations, malformed XML and excessive body/tag/depth/link sizes
are rejected. Existing `rss:<id>` identifiers remain compatible.

Loaded configured sources appear in the shared source filter. Focused fixtures
passed (53 tests), including timestamp projection and real UI-controller labels.
A real local middleware HTTP smoke returned the expected Atom projection using
fixture transport; it was not a live external feed check. An isolated npm ci
verified the parser version/integrity; full application npm ci is still an
installation step on the user's machine.

Latest ordinary suite: 7,134 tests, 7,133 passed, one skipped, zero failed;
allocation probes excluded by the existing runner plan. Production build,
formatting, architecture boundaries and layer-token compatibility passed.
Existing large-chunk build warnings remain. Browser/GPU/live-feed/long-session
acceptance and allocation budgets are still unverified.

## 9. Validation checkpoint — 2026-10-16

Separated remaining tasks from completed work, retained the entire earlier log,
and added an ordered runbook and results template. This increment changes
only documentation. Verified formatting, referenced local paths, patch
application against the Atom delivery tree and resulting tree identity.
No application runtime checks or manual acceptance are newly claimed here.

## Failed approaches and conditions for retry

| Attempt / finding                                       | Recorded outcome and next condition                                                                                                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unrestricted parallel npm test on this development host | Exited without a final summary. Use the repository's test partition with bounded concurrency for ordinary tests; require a summary and exit status before claiming success.         |
| Fixture tests with missing /tmp                         | Host lacked a writable temporary directory. Setting TMPDIR to an existing writable workspace directory resolved fixture failures.                                                   |
| Serialized allocation probes                            | Failed with ENOENT / uv_resident_set_memory because the host cannot measure resident memory. Budgets were not measured. Retry on a normal compatible host; do not lower thresholds. |
| Local Chromium / browser fixture gate                   | Chromium exited before opening a page. No browser assertions, screenshots or GPU acceptance passed. Retry with a working local Chrome/Puppeteer installation.                       |
| Remote browser against development-host loopback        | Connection refused; the browser and server have separate loopback contexts. Use a browser on the server's host or an explicitly working route.                                      |
| Cross-session local HTTP smoke                          | Separate execution sessions could not connect to each other's loopback. Starting client and server within one process succeeded.                                                    |
| Initial upstream ahead count                            | Shallow-history count was misleading. Complete history before calculating divergence; corrected count was 165 commits.                                                              |
| Initial stylesheet ordering                             | Tests caught Cyber no longer being last. Corrected ordering; preserve that requirement in future CSS changes.                                                                       |
| ReliefWeb without approved identity                     | Read-only probe returned 403. Wait for an approved appname; do not repeatedly try unapproved names.                                                                                 |
| Google News canonical URL assumption                    | No verified resolution implemented. Retain aggregator provenance; do not treat tracking normalization as canonical verification.                                                    |

## Updating this record

For each future change record: date, purpose, affected behavior, important design
constraints, checks actually run, remaining acceptance, delivery baseline and any
failed approach worth preserving. Add user-reported validation results with their
tested commit/date; never retrospectively convert a blocked check into a pass.
