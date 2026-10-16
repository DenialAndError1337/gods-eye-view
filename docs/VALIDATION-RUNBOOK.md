# Validation runbook — accumulated dashboard updates

Checkpoint: 2026-10-16, through GEV_ATOM_FEEDS_UPDATE. Allow 15–20 minutes for
the first smoke pass, then a deeper pass and a 30–60 minute observation session.
You can read this guide before installing the documentation patch.
Record outcomes in [VALIDATION-RESULTS.md](VALIDATION-RESULTS.md).

## 1. Identify what is installed

In your existing repository, use:

```sh
cd ~/Documents/Projects/gev-maintained
git switch gev/osint-dashboard
git status --short
git log --oneline -n 12
node --version
npm --version
```

`cd` opens your project folder; `git switch` chooses the dashboard branch.
Status lists uncommitted files (empty output means clean). The log lists your
recent saved checkpoints. Record the current commit, installed increments,
operating system and browser version. Preserve uncommitted work before applying
patches or switching branches; a failed switch is a reason to inspect status.

The installation order is reconciled source → news provenance → configured RSS
→ Atom feeds → this documentation checkpoint. The original milestone 1–4 ZIPs
are superseded. Do not reapply patches already committed. If unsure which update
is installed, send the status/log output before applying another patch.

After the Atom update, run `npm ci` once to install the lockfile dependencies.
It rebuilds node_modules; it does not commit source changes. This documentation
update adds no dependency. The checked-in package.json currently permits Node
24.14+ within 24.x, or 26.x. Check your version before investigating install errors.

```sh
npm ci
npm run dev
```

Keep that terminal running. Open the **Local URL actually printed by Vite**;
its port can vary. Use a second terminal in the same folder for later commands.
A successful build alone does not establish that browser interactions work.

## 2. Short smoke pass

Use the normal standalone application, not an embed. Record each ID separately.

| ID  | Action                                                                                   | Expected result                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Open the local URL and move/zoom the globe.                                              | App renders and remains interactive. Record startup errors and whether existing map setup is needed.                                                                               |
| S2  | Open MONITOR with earthquakes initially disabled.                                        | Panel opens without enabling earthquakes or acquiring news. A metadata-only /api/monitoring-news-sources request is allowed. Other existing app layers may have their own traffic. |
| S3  | Click Enable earthquakes; allow USGS loading.                                            | Existing layer loads; accepted records appear in list and on map. A provider failure must be readable; no data is not itself evidence of a working integration.                    |
| S4  | Select a quake row, then click a visible quake on the globe.                             | Details/highlight follow selection in both directions. Selecting alone does not move the camera.                                                                                   |
| S5  | Click Locate on map for a quake.                                                         | Camera navigation happens explicitly; controls remain usable afterwards.                                                                                                           |
| S6  | Use Use map bounds, pan elsewhere and refresh the bounds; then Global and Reset filters. | Results follow the chosen area/filter state; resetting restores defaults. Include unlocated reports in area filter controls whether news survives area filtering.                  |
| S7  | Close MONITOR. Reopen it.                                                                | Panel closes cleanly, its quake map filter is removed, globe controls work, reopening does not duplicate the UI. Do not assume transient filters survive reload.                   |

If startup, selection or closing breaks, capture it before continuing. It is
useful to test the remaining independent checks, but do not mark the milestone
accepted with an unresolved core regression.

## 3. News, links and local filters

Open browser developer tools → Network and Console if comfortable. Network
requests to `/api/monitoring-news` identify acquisition. Requests for source
inventory are metadata, not a news search.

| ID  | Action                                                                                                   | Expected result                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | Choose Google explicitly, choose a topic/window and click Search news once.                              | Loading ends in reports, a legitimate empty response or a readable provider error. Record provider/time/status; current availability is not guaranteed. Avoid repeated clicks during the displayed cooldown.                |
| N2  | Inspect a report's details and open its source.                                                          | Safe link opens a separate tab. Source host and provenance are shown; Google links remain aggregator links. News has no invented coordinates or Locate action.                                                              |
| N3  | Change loaded keyword, publisher and source filters, then reset.                                         | Only loaded records change; filtering does not send another monitoring-news acquisition. No match is a valid result; reset restores defaults.                                                                               |
| N4  | Check displayed times and unknown/unlocated counts.                                                      | UTC and timestamp meaning are explicit. GDELT indexing time is not presented as publication time; absent time/location stays unknown.                                                                                       |
| N5  | Inspect any reporting groups present.                                                                    | Grouping is marked heuristic; individual reports remain selectable. No grouping implies confirmation. If live reports produce no group, record this scenario as NOT RUN and use the fixture tests below for grouping logic. |
| N6  | Enable Remember provider on this device, choose a provider and reload. Then uncheck it and reload again. | Only the opted-in provider choice is restored; no search starts automatically. Unchecking removes that saved choice. Queries, reports and transient filters are not saved by this option.                                   |
| N7  | Run a separate GDELT search after cooldown permits.                                                      | Success/empty/error is readable. Record an outage or timeout as source availability evidence; investigate unexpected app errors separately.                                                                                 |
| N8  | With browser network throttling, begin a search and close the panel before completion; reopen.           | No late response corrupts a newer state, no duplicate UI and no console exception. If timing cannot be reproduced, leave NOT RUN; ownership fixtures cover the deterministic case.                                          |

Default loaded filtering uses a 24-hour window. For unexpectedly missing older
reports, check both the acquisition window and the loaded-record time filter.
Storage disabled by the browser should not break the panel; it may prevent
remembering a choice. Test that condition only if relevant to your normal use.

## 4. Configured RSS / Atom sources (optional)

Skip this section as BLOCKED / no configured source if you have not configured
one. Built-in Google/GDELT use does not require a configured feed.
Follow [CONFIGURED-RSS.md](CONFIGURED-RSS.md) for the exact environment format,
public HTTPS restrictions and refresh behavior. Use a feed you are allowed to
consume. Do not add a localhost fixture URL: private/local destinations are
intentionally rejected. Do not share full feed URLs containing access tokens.
After changing .env, fully stop/restart the dev server and reload the page.

| ID  | Action                                                                    | Expected result                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Open MONITOR with a valid configured source.                              | Label appears as a selectable provider; opening the panel only loads source metadata. No full configured URL/query token is exposed by the inventory endpoint.                                                                                            |
| F2  | Select it and click Search news.                                          | Bounded recent items load or the app reports a readable error/empty state. Feed keyword/region fields filter headlines; this is not an archive search.                                                                                                    |
| F3  | Use the shared loaded Source filter.                                      | Loaded custom source is selectable; switching to USGS changes the visible cohort without acquiring news.                                                                                                                                                  |
| F4  | Inspect Atom links/times, if your source is Atom.                         | Article links open safely; published and updated times have appropriate labels. An entry with only updated uses Update (Atom); missing/invalid times remain unknown. If the live source lacks these cases, leave the cases NOT RUN and use fixture tests. |
| F5  | Repeat a query within the configured refresh interval after any cooldown. | Source data retains its acquisition age rather than appearing newly fetched. Browser requests may still occur; server cache behavior cannot be inferred from their count alone.                                                                           |

Malformed XML, private DNS, redirects, excessive payloads, cache expiry and
failure recovery are tested deterministically by server fixtures below. Do not
weaken source protections to make a test feed load.

## 5. Source health and existing app behavior

| ID  | Action                                                                                                            | Expected result                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Inspect USGS/news source status and available layer-row tooltips before and after loading.                        | Attempt, acceptance/completion and source snapshot times have distinct meanings. Missing metadata is unknown, not a fabricated current timestamp.                                                                                     |
| H2  | Enable satellites normally and inspect its health tooltip after loading.                                          | Core attempt/acceptance and original cache acquisition are distinguishable. An orbital-element epoch is not called proxy acquisition time. Record live availability separately.                                                       |
| H3  | If normally used, enable then disable dense Starlink data.                                                        | Catalog/UI remain responsive; disabled dense groups no longer contribute active provenance. Use ingestion fixtures for deterministic failure/recovery checks.                                                                         |
| H4  | Refresh a layer using its existing supported controls/normal schedule.                                            | Manager history updates for manager-owned work; source timestamps keep their own semantics. Independent loops are not automatically covered.                                                                                          |
| R1  | Repeat your usual tracking, cockpit, weather and share-link workflow with MONITOR open, then closed.              | Existing navigation/tracking behavior remains intact. Mark features requiring absent keys/configuration BLOCKED. Monitoring filters are not encoded in share links.                                                                   |
| R2  | Test your normal desktop size and a narrow window around 390 CSS pixels; use long report titles and keyboard Tab. | Controls/details remain readable and reachable, close/reset work, and keyboard focus is visible. Record overlap, clipping or inaccessible controls.                                                                                   |
| R3  | Run for 30–60 minutes with the layers you normally use; open/close MONITOR several times.                         | No accumulating duplicate rows/panels, stuck requests, recurring exceptions or obvious responsiveness deterioration. Record duration/layers/browser and any observed memory growth; no new performance budget has been measured here. |

A cached/stale label depends on actual source/cache conditions. Blocking a browser
request does not simulate a remote CelesTrak outage behind the local server.
Use automated proxy/ingestion fixtures for deterministic stale-fallback behavior.
Do not claim it passed manually if that condition did not occur.

## 6. Automated checks on your machine

Stop the dev server if you need resources; these commands do not commit or push.
For the routine automated pass, run:

```sh
npm run validate:monitoring
```

This runs focused regressions, the production build, formatting, architecture,
layer-token and whitespace checks. It prints the path to a new
`validation-output/run-.../report.md`; the same folder contains report.json and
per-check logs. Each run gets a new folder, so earlier evidence is preserved.
The default folder is ignored by Git. Review/redact diagnostics before sharing;
reports stay local and are not uploaded automatically.

For the complete ordinary suite and both serialized allocation probes, use
Node 24 and run:

```sh
npm run validate:monitoring -- --full
```

The full runner uses the repository's discovery/partition logic, ordinary
concurrency 8 and unchanged allocation invocations/budgets. It continues through
independent gates after a failure and exits nonzero if a requested check fails
or is blocked. On another supported Node version the allocation checks are
BLOCKED, rather than counted as passing. Default focused mode leaves the full
suite NOT RUN. Browser/manual checks remain NOT RUN in both modes; complete
the separate steps above and below. A passing automated verdict is not overall
acceptance.

`npm run validate:monitoring -- --out /path/to/results` chooses a different parent
folder; a new run folder is still created. `--help` prints usage. The command does
not install dependencies, commit, push or acquire live feed data. Interrupting the runner leaves its last saved report INCOMPLETE.

The individual commands remain useful for reproducing a failure. Run each
separately and record its exit status and final summary.

Focused regressions for the custom workflow:

```sh
node --test --test-concurrency=8 src/monitoring/monitoring.test.mjs src/ui/monitoringPanel.test.mjs server/providers/monitoringNews.test.mjs server/providers/monitoringFeeds.test.mjs server/providers/monitoringFeedXml.test.mjs src/layers/satellites/health.test.mjs server/providers/space/celestrak.test.mjs src/layers/earthquakes/ownership.test.mjs src/data/manager.test.mjs src/data/layerSnapshot.test.mjs src/services/requests.test.mjs
```

Then the repository-wide gates:

```sh
npm test
npm run build
npm run format:check
npm run check:boundaries
npm run layer-token:check -- --base-ref 537e99dfa45a3f7b239ad6230a65be658b3ea29d
git diff --check
```

`npm test` includes the allocation probes using the repository's runner. They
could not measure memory on the development host (ENOENT,
uv_resident_set_memory); retry them on your machine without changing thresholds.
A failing assertion on your machine needs investigation; do not assume every
failure shares that host limitation. Build warnings about existing large chunks
were present before this checkpoint; record new warnings/errors separately.

The latest development-host ordinary run reported 7,139 passes and one skip;
that excluded the two allocation probes and is not a claim that full npm test
passed. The development-host evidence for the runner increment is recorded in DONE.md;
manual results on your machine remain separate.

Optional browser fixture gate, with the dev server running:

```sh
node scripts/qa-monitoring.mjs --url http://localhost:4173
```

Replace `http://localhost:4173` with your actual Vite Local URL. The script uses
Puppeteer and requires a working Chrome installation. See
[MONITORING.md](MONITORING.md) for its fixture scope. It checks the original
monitoring/earthquake workflow; it is not complete browser coverage of Atom,
provider preferences, all report groups or all UI regressions. Record browser
launch failure as BLOCKED, rather than claiming its assertions passed.

## 7. Record results and choose the next change

Use PASS only when the expected result was observed. Use FAIL for an observed
mismatch, BLOCKED when a required environment/source/configuration prevents the
check, and NOT RUN for an unattempted scenario. A source outage can block a live
data check; app crashes or incorrect error handling still count as failures.

For each failure record: check ID, tested commit, date/time, exact steps,
expected/actual result, browser/OS, relevant HTTP status and sanitized console
message. Never paste .env, credentials, cookies or token-bearing URLs. A short
screen recording or screenshot is optional when it helps show a visual problem.

Send the completed results or just failed/blocked IDs and their details back.
Fix and retest core failures before the next feature increment. If you need to
compare an earlier committed version, first preserve uncommitted changes and
identify the known-good commit from git log; create a separate branch at that
commit rather than deleting current work. Do not use git reset --hard as a
routine validation step.

## Aircraft telemetry increment addendum

The user reported all automated gates passed for the preceding validation-runner
version on 2026-10-16. Preserve that result; it does not cover later source edits.
After applying GEV_AIRCRAFT_HEALTH_UPDATE, rerun the automated command and add a
new dated result. Focused mode now includes aircraft ingestion and layer-panel
regressions as well as the earlier monitoring cases.

Enable aircraft and inspect the source/status tooltip: Snapshot request describes
adapter attempts and acceptance, Manager update describes manager-owned calls,
and Source data timestamp retains source observation time. A successful cached
response must not be described as newly acquired upstream data. Check normal
tracking and changing military filtering while aircraft is active. If an actual
retry interval occurs, skipped calls should not advance snapshot attempt time.
Use fixtures for stale/failure/cancellation cases that do not occur live.

## AIS transport increment addendum

GEV_AIS_TRANSPORT_HEALTH_UPDATE follows the aircraft-health update. Restart the
dev server after applying it and rerun `npm run validate:monitoring` (or the full
mode on your calibrated host). The focused command now includes AIS watchdog,
transport, source and endpoint regressions.

With your existing AIS setup, inspect the vessel source/status tooltip: connection
attempt and handshake are server transport events; valid AIS message time is not
necessarily a usable position time. Original position data age must be preserved.
Historical failure time/class may remain visible after recovery; read current
status separately. A browser reload is not a server watchdog restart.

Missing AIS credentials or unavailable live service can block live acceptance.
Do not change credentials or provoke upstream failures solely to test history;
use the local socket/middleware fixtures for deterministic failure and recovery.
See SOURCE-HEALTH.md for field meanings and lifetime. This increment does not
alter the active results template; keep your manual notes tied to tested commits.

## Bike-share history increment addendum

GEV_BIKESHARE_HEALTH_UPDATE follows the AIS transport update. Restart the dev
server after applying it and run the automated validation command for this new
commit. The focused runner now includes bike-share request/failure regressions.

At a registered city and normal activation altitude, enable Bike Share and inspect
its source/status tooltip. Information and live-status requests have separate
attempt/completion/accepted times. Cache reuse is not another information attempt;
status refresh affects its own channel. The layer refresh timestamp is explicitly
local acceptance, not operator publication time. Failed cities are prioritized;
up to eight current histories are shown, with a count if additional entries exist.

Move away and back, or disable/re-enable, and confirm loading clears and station
selection/counts still behave normally. Do not create extra source requests to
prove cache internals; offline fixtures cover coalescing, old responses and cache
ownership. History is bounded to the registry and layer lifetime, not a durable
archive. Missing map proximity or an unavailable provider must be recorded
accurately. Preserve your existing results and add a dated entry for the new
commit; this patch leaves the active results template untouched.

## Saved filter views acceptance

1. Open MONITOR, set a keyword, source/publisher and time window, then use map bounds.
   Name the view and press Save/update view. Check the local-save status.
2. Reset filters, choose the saved view and Load view. Verify controls, counts and
   earthquake map cohort agree, including antimeridian bounds if applicable.
   No news search, layer activation or camera movement should occur.
3. Reload the page. Open MONITOR: default filters must remain until you explicitly
   choose/load a saved view. A source/publisher not currently loaded can match zero.
4. Save the same name with different filters, load it and check replacement. Delete
   it and reload to confirm removal. Reset filters alone must preserve saved views.
5. With device storage blocked, verify a clear failure status, usable ordinary
   filters and no success claim. Check keyboard focus and narrow-screen scrolling.
   Record actual observations and tested commit in VALIDATION-RESULTS.md.

Saved keywords/regions stay on this device until deleted or browser storage is
cleared. Do not store sensitive presets on a shared device unless intended.
