# TODO — standalone OSINT dashboard

Updated 2026-10-16. Implementation history and decisions: [DONE.md](DONE.md).
Detailed earlier verification: [implementation log](docs/history/IMPLEMENTATION-LOG.md).
Implemented does not mean accepted on the user's laptop.

## Next milestone: validate the accumulated changes

- [x] Add a single-command automated validation runner with per-check logs and
      Markdown/JSON reports. `npm run validate:monitoring` runs focused tests,
      build and quality checks; `-- --full` adds the full ordinary suite and
      serialized allocation probes. This does not complete user acceptance.

- [x] Establish the installed baseline and dependency state using the
      [validation runbook](docs/VALIDATION-RUNBOOK.md).
- [ ] Run the short browser smoke checks, then news/provenance, source-health,
      configured-feed (if configured) and navigation/layout checks.
- [ ] Record actual outcomes in [validation results](docs/VALIDATION-RESULTS.md),
      including failures, blocked checks and the tested commit.
- [x] Run the full automated suite on a host that supports Node memory measurement;
      retain the existing allocation thresholds.
- [ ] Run a fresh full validation for the latest cumulative increment on the laptop;
      preserve the preceding all-green report as evidence for its own commit.
- [ ] Complete the browser fixture gate on a host where Chromium starts.
- [ ] Complete a 30–60 minute session with the intended layers enabled.
- [ ] Fix and retest reported regressions before advancing feature scope.

User reported full automated validation PASS on 2026-10-16 at 18:23 Europe/Brussels,
including both allocation probes, after npm ci installed the missing Atom parser.
Browser/live/GPU/long-session acceptance remains pending. The user authorized
parallel feature work while performing those manual checks.
The current GBFS timestamp increment's development-host ordinary run passed: 7,172 tests
passed, one skipped, zero failed. This also exercises the preceding aircraft, AIS and
validator changes together. Allocation measurements and browser/live acceptance
for the new cumulative source still require the user's host. Earlier failed
runs and their rechecks remain in DONE.md rather than being reclassified as passes.

- [x] Resolve the existing huge-string validator timing failure exposed during
      this increment: use a safe UTF-16 lower bound before starting code-point
      iteration. Original 200 ms assertion retained; surrogate bounds tested.

## Remaining implementation backlog

The user authorized bounded implementation while manual validation proceeds.
These are candidates, rather than promises that each will ship.

- [ ] Canonical publisher URLs: evaluate evidence-backed resolution of Google News
      links. Preserve original links and provenance; do not label an unresolved
      aggregator link as a verified publisher URL.
- [ ] Broader syndication analysis: assess quality with real examples before
      extending the conservative URL/headline grouping heuristic. Group membership
      must not imply independent corroboration or a confirmed incident.
- [x] First independent-source telemetry slice: inventory aircraft, AIS, bike-share,
      AQHI, satellite and monitoring acquisition paths; add aircraft snapshot-call
      history including direct refreshes and the existing retry deadline.
      See docs/SOURCE-HEALTH.md for coverage and limits.
- [x] AIS transport connection-attempt history: expose watchdog commissioning,
      handshake and classified-failure times through the existing API, source
      adapter, layer stats, shared snapshot and tooltip. Reconnect policy unchanged.
- [x] Bike-share per-city information/status request history, copied stats/snapshots,
      bounded source tooltip and explicit local-acceptance timestamp meaning.
      Cancelled uncooperative responses cannot overwrite caches or loading state.
- [x] GBFS reported feed-update timestamps: retain valid numeric/RFC3339
      last_updated separately from local acceptance and station last_reported.
      Assess proxy/HTTP cache evidence without inventing upstream acquisition time.
- [ ] Extend telemetry inventory to remaining layer families; assess station-level
      reporting timestamps and explicit upstream acquisition evidence separately.
- [ ] Optional configured-feed editing in the browser: first decide how local
      configuration is persisted and validated. Server-side HTTPS/DNS protections
      must continue to apply.
- [x] Saved filter views/regions: explicit local save/load/delete, bounded versioned
      storage and preserved unsupported data. No automatic restore or acquisition.
      Filters remain excluded from share links; camera/layers/results are not saved.
- [ ] Optional ReliefWeb integration: requires an approved application identity.
      No registration has been submitted.
- [ ] Historical archives, incident correlation, alerts and automated reports:
      later scope requiring separate design and validation.

## Maintenance workflow

- Keep the dashboard on `gev/osint-dashboard`; keep upstream reconciliation a
  deliberate checkpoint. The current delivery baseline is upstream
  `537e99dfa45a3f7b239ad6230a65be658b3ea29d`, plus the documented customizations.
- Compare upstream changes against the actual customized branch and its tests;
  do not assume a proposed or merged upstream feature replaces our integration.
- For each increment: implement a bounded change, document it in DONE, provide
  an incremental patch/ZIP, run appropriate checks, and record user acceptance
  separately. Record failed approaches and their conditions before retrying them.
- Future handoffs should read TODO, DONE, validation results and relevant source
  guides before proposing more work. Git records exact edits; these documents
  record intent, verification and unresolved limits.
