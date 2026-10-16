# DONE — implementation history and decisions

Updated 2026-10-16. This file records completed implementation, evidence and
known limits. User acceptance is tracked separately in
[validation results](docs/VALIDATION-RESULTS.md). The user reported all automated gates, including both allocation probes, PASS
on their laptop at 18:23 Europe/Brussels on 2026-10-16; browser/live/GPU/long-session
acceptance remains pending.

The [original TODO / milestone log](docs/history/IMPLEMENTATION-LOG.md) is
preserved in full, including per-increment test counts, files and earlier backlog
wording. Its “next” sections are historical; current work is in [TODO.md](TODO.md).

## Delivery order and installation context

| Delivery                                | Purpose                                                                                          | Installation relationship                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| GEV_MILESTONE_1 through GEV_MILESTONE_4 | Initial custom monitoring and health work                                                        | Superseded by the reconciled source delivery; do not overlay these old ZIPs again                         |
| GEV_RECONCILED_SOURCE_2026-10-16        | Full source reconciled with upstream                                                             | Starting point for the subsequent increments; customization patch applies to pinned upstream commit below |
| GEV_NEWS_PROVENANCE_UPDATE              | Link provenance, related-report groups, remembered provider                                      | Apply after reconciled source                                                                             |
| GEV_CONFIGURED_RSS_UPDATE               | Operator-configured HTTPS feed sources                                                           | Apply after news provenance                                                                               |
| GEV_ATOM_FEEDS_UPDATE                   | Strict Atom/RSS XML parsing, timestamp provenance, custom source filters                         | Apply after configured RSS; run npm ci because a dependency was added                                     |
| GEV_VALIDATION_CHECKPOINT               | TODO/DONE split, preserved history and validation runbook/results                                | Documentation increment after Atom; no application code or dependencies changed                           |
| GEV_VALIDATION_RUNNER_UPDATE            | Automated checks with local per-gate logs and reports                                            | Apply after the validation checkpoint; no new dependencies                                                |
| GEV_AIRCRAFT_HEALTH_UPDATE              | Aircraft snapshot-request history, scoped telemetry inventory and recorded laptop automated pass | Apply after the validation runner update; manual acceptance still pending                                 |
| GEV_AIS_TRANSPORT_HEALTH_UPDATE         | AIS watchdog event history from server to tooltip                                                | Apply after the aircraft-health update; no dependencies or retry policy changes                           |
| GEV_BIKESHARE_HEALTH_UPDATE             | Per-city GBFS request history and cancellation ownership                                         | Apply after the AIS transport update; no new dependencies or polling intervals                            |
| GEV_SAVED_VIEWS_UPDATE | Explicit local filter/region presets | Apply after the bike-share health update; no new dependencies |

Pinned upstream: `537e99dfa45a3f7b239ad6230a65be658b3ea29d`.
The user reported committing the reconciled customization as `d068dcbd` and
pushing `gev/osint-dashboard`. The later uploaded validation report identified
clean commit `a1eec9eee1591980100a0770d0addd6aded01018`; after npm ci the user
reported a passing full automated rerun. Manual acceptance remains pending.
Never infer installation or acceptance from delivery alone.

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

## 10. Automated validation reports — 2026-10-16

Added `npm run validate:monitoring` to run focused monitoring regressions,
production build, formatting, import/package boundaries, layer-token
compatibility and whitespace checks. `-- --full` uses the existing unit-test
discovery/partition, bounded ordinary concurrency and isolated allocation
probes without changing their thresholds. Allocation checks require calibrated
Node 24 and are BLOCKED on other runtimes.

Each run creates a fresh local report directory with Markdown/JSON summaries
and separate logs. Results are saved after each gate; independent gates continue
after failures, with nonzero final exit for failed/blocked requested checks.
Tests require both exit zero and a nonempty completed TAP summary. Browser,
manual, live-source and long-session acceptance stay explicitly NOT RUN.
No dependencies, live feed requests, source configuration or Git mutations are
introduced by the command.
Reports are ignored by Git and not automatically shared. Diagnostics should be
reviewed before sharing.

Verification: all six new runner tests passed; the real default command passed
198 focused tests and all build/quality gates. Production build: 849 modules,
10.24 seconds, with existing large-chunk warnings. A separate full ordinary run
reported 7,140 tests: 7,139 passed, one skipped, zero failed, 53.05 seconds.
Allocation probes were excluded by the existing partition; the previously
recorded host memory-measurement limitation is unchanged. Browser/GPU/live-feed
and user acceptance remain pending. Help/syntax, ignored default report output,
documentation formatting/links and incremental patch/result-tree checks passed.
The delivery is an incremental patch after GEV_VALIDATION_CHECKPOINT.

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

## 11. Aircraft snapshot-request history and verification fixes — 2026-10-16

Implemented the first independent-source telemetry slice. Aircraft ingestion
records source-adapter attempt, completion, accepted and last clean acceptance
times, including direct updates outside manager refreshes. Backoff-skipped and
pre-aborted calls do not count as attempts. Failure/cancellation/degraded
acceptance preserve the prior clean acceptance. Late superseded completions
cannot overwrite the current attempt's telemetry. Initialization starts a new
source-history lifetime; public stats/snapshots copy the envelope.

The source/status tooltip distinguishes manager history, snapshot-request history,
source observation time and the existing retry deadline. Source-adapter acceptance
is not a claim of a new upstream fetch. Acquisition, polling, retry policy and
record-selection behavior are unchanged. Coverage inventory and remaining gaps
are in docs/SOURCE-HEALTH.md. No dependencies or new requests were added.

User validation evidence for the preceding increment: the first laptop run failed
20 test files and the build because @xmldom/xmldom was not installed. After npm ci,
the user reported all automated gates PASS, including both allocation probes.
That report validates the preceding delivery, not this new telemetry increment.
The rerun commit was not reprinted; the previous uploaded report identified
clean commit a1eec9eee1591980100a0770d0addd6aded01018 on Node 24.21.0/Linux.

Final targeted verification: 48 tests passed across aircraft ingestion, copied
snapshots, layer tooltips, traffic navigation and Unicode string bounds. The
final actual default runner passed 217 tests, production build (849 modules,
38.99 seconds; existing large-chunk warnings), adopted formatting, import/package
boundaries, layer-token compatibility and whitespace checks. Patch application,
resulting tree identity and documentation links/formatting were also checked.
Allocation probes and real-browser acceptance for this new increment remain
pending on the user's machine.

During full verification, the unchanged tool-schema 200 ms huge-string check
failed (and failed in isolated rechecks). Its bounded code-point loop still began
iterating a 100-million-character string. Added a constant-time UTF-16 lower-bound
shortcut when length already proves the counting limit is reached; ambiguous
cases retain code-point iteration. Existing min/max behavior, including paired
and unpaired surrogates, is covered by a new independent-count comparison test.
The original 200 ms assertion is unchanged and passed after the fix (4.75 ms
for its test case). The focused runner now includes this regression too. This is
an additional validator optimization included in this delivery, not a relaxation
of the test threshold.

The initial ordinary run had 7,145 passes, one failure and one skip. Its failed
check was the tool-schema timing case described above; that result was not
reported as a pass. An intermediate ordinary recheck was interrupted to apply
the validator fix. The subsequent ordinary run had 7,144 passes, three failures
and one skip (7,148 tests): two unchanged CCTV launcher fixtures hit their
30-second process deadlines and one traffic navigation fixture expected a fetch
before a time-sliced parser had completed. Both CCTV cases passed in a serialized
isolated recheck (11.08 and 9.08 seconds). The traffic fixture now stabilizes its
performance-budget clock alongside its fake timers; its existing road-request
assertions are unchanged, and its full navigation file passed in the final
48-test targeted run. No timeout or allocation threshold was raised, and no
assertion was removed. A clean single full-suite run for this increment is still
pending on the user's host; isolated rechecks do not turn a failed aggregate run
into a pass.

Your active docs/VALIDATION-RESULTS.md template is excluded from this patch so
ongoing manual notes are preserved; the reported automated evidence is recorded
in this DONE file.

## 12. AIS transport event history — 2026-10-16

Added watchdog-owned last connection attempt, handshake, classified failure and
failure retry class. History is captured at the existing commissioning/open/retry
branches, not on HTTP polling. The existing valid-message time remains distinct
from newest vessel-position time. Orphan events cannot change history; data
recovery preserves past failure events. Dispose resets event history while the
existing generation high-water mark is retained. Credential rotation does not
erase past history or leak fingerprints.

The local vessels endpoint, normalized source snapshot, owned ingestion, copied
public stats and shared layer snapshot carry this optional envelope. Unknown or
invalid timestamps remain null; failure classes and fields are whitelisted.
Older/custom sources without metadata remain supported. The tooltip describes
handshakes/messages as transport evidence, not proof of current positions, and
uses the existing source retry deadline. No new socket, poll, retry timer,
credential, provider account or dependency is introduced.

Verification: 249 affected watchdog, adapter, real local transport, source,
ownership, analyst, snapshot, UI and local-provider tests passed. The local
HTTP/WebSocket fixture verifies the actual vessels endpoint exposes only the
four intended history fields. The full ordinary suite also passed: 7,156 tests,
7,155 passed, one skipped, zero failed; 95.41 seconds using the existing allocation
partition and concurrency 8. This supplies a clean cumulative ordinary run after
the preceding aircraft increment's test-clock/performance fixes; earlier failures
remain historical.

The final actual default runner passed 443 focused tests, production build
(13.84 seconds; existing large-chunk warnings), adopted formatting (1,412 files),
import/package boundaries, layer-token compatibility and whitespace checks.
Patch application, resulting tree identity and local documentation links were
verified. No full application npm ci was needed for this dependency-free update.
Active manual validation notes remain untouched. Allocation probes and browser/
live acceptance for this new cumulative source remain pending on the user's host.

## 13. Bike-share per-city request history — 2026-10-16

Added latest information/status request attempt, completion, accepted time and
outcome per registered city. Static information cache hits and coalesced callers
do not become attempts. Failures retain previous accepted time and cache age;
recovery affects only the requesting city's channel. Histories are bounded by the
registry (currently 52 cities), retained through disable/out-of-range changes and
reset with layer initialization. Copied public stats/snapshots include active and
failed flags, with nested channel copies.

The existing source/status tooltip prioritizes failed cities and shows up to eight
current city histories, explicitly noting additional current cities. It separates
adapter acceptance from upstream freshness. Existing layer refresh time is now
labelled local acceptance in stats/snapshots and the tooltip; no GBFS publication
or last-reported timestamp is invented. Polling intervals, source URLs, static
cache policy, request coalescing and existing per-city failure severity remain.

Inspection also found that an abort-ignoring source could later populate caches
and retain loading. Cancelled callers now settle promptly through an abort race;
cache writes require the current request/lifetime, loading is released exactly
once, and late settlement cannot decrement a newer operation's loading count.
No new request or retry timer is added. This is a bounded ownership correction,
not a claim that an uncooperative underlying transport can be forcibly stopped.

Verification so far: 52 affected tests passed, covering both channels, cache and
coalescing, failure/recovery, neighbouring-city isolation, immediate cancellation,
late responses, reinitialized lifetimes, copied snapshots and tooltip limits.
Full ordinary suite: 7,164 tests, 7,163 passed, one skipped, zero failed;
51.98 seconds with the existing allocation partition and concurrency 8. Final
default runner passed 470 focused tests. Production build passed in 9.34 seconds
with the existing large-chunk warnings; formatting (1,413 files), import/package
boundaries, layer-token compatibility and whitespace checks passed. Patch
application/resulting tree identity and local documentation links were verified.
Allocation measurements and browser/live acceptance for the new cumulative
source remain pending on the user's host.
Active manual validation notes are excluded from the patch.

## 14. Explicit saved filter views and regions — 2026-10-16

Added named device-local save/update, load and delete controls in MONITOR. Each
preset contains only shared loaded-record filters and optional map bounds, including
antimeridian regions. The relative time window stays relative to now. Views never
restore automatically; loading does not search, enable layers or move the camera.
Reset filters preserves presets. Unloaded source/publisher filters remain selected.
News acquisition form values, provider preferences, results, selection and camera
state are excluded. The provider checkbox retains its separate provider-only scope.

Storage is a distinct version-1 envelope, at most 12 views, 60-character names,
120-character keywords, bounded source/publisher labels, validated finite geographic
coordinates and a conservative 32 KiB UTF-16 payload budget. Case-insensitive matching
names update an existing view. Reads sanitize whitelisted fields into fresh copies.
Mutations reread storage first; malformed/unknown versions block writes and remain
intact. No migration is needed from an earlier saved-view format; a future format
needs an explicit migration. Storage errors cannot produce a false success message.
Local keywords/regions and deletion behavior are explained in the interface/docs.

Development verification: 29 affected tests passed, including explicit save/load,
reload without automatic restoration, antimeridian bounds, delete, storage failures,
limits, detached copies, whitelist exclusions and unsupported-version preservation.
The first new UI test used a change event for the keyword input, whose existing
handler uses input; corrected the test to dispatch the actual input event. No
production keyword behavior was changed to accommodate the fixture.
Cumulative ordinary suite passed: 7,169 tests, 7,168 passed, one skipped, zero
failed (50.88 seconds), using the existing allocation partition. The default runner
passed 475 focused tests, production build (9.83 seconds), adopted formatting,
import/package boundaries, layer-token compatibility and whitespace. The retained
initial focused log was incomplete despite its parsed passing summary; reran that
gate and retained a complete 475-pass log. Patch application and resulting tree
identity, documentation links and unchanged manual notes/history were verified.
Browser layout/focus, GPU, live feeds and long-session acceptance remain pending on
the user's host. Active manual validation notes are excluded from this patch.

## Updating this record

For each future change record: date, purpose, affected behavior, important design
constraints, checks actually run, remaining acceptance, delivery baseline and any
failed approach worth preserving. Add user-reported validation results with their
tested commit/date; never retrospectively convert a blocked check into a pass.
