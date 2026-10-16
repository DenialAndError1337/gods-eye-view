# TODO — standalone OSINT dashboard

Updated 2026-10-16. Implementation history and decisions: [DONE.md](DONE.md).
Detailed earlier verification: [implementation log](docs/history/IMPLEMENTATION-LOG.md).
Implemented does not mean accepted on the user's laptop.

## Next milestone: validate the accumulated changes

- [x] Add a single-command automated validation runner with per-check logs and
      Markdown/JSON reports. `npm run validate:monitoring` runs focused tests,
      build and quality checks; `-- --full` adds the full ordinary suite and
      serialized allocation probes. This does not complete user acceptance.

- [ ] Establish the installed baseline and dependency state using the
      [validation runbook](docs/VALIDATION-RUNBOOK.md).
- [ ] Run the short browser smoke checks, then news/provenance, source-health,
      configured-feed (if configured) and navigation/layout checks.
- [ ] Record actual outcomes in [validation results](docs/VALIDATION-RESULTS.md),
      including failures, blocked checks and the tested commit.
- [ ] Run the full automated suite on a host that supports Node memory measurement;
      retain the existing allocation thresholds.
- [ ] Complete the browser fixture gate on a host where Chromium starts.
- [ ] Complete a 30–60 minute session with the intended layers enabled.
- [ ] Fix and retest reported regressions before advancing feature scope.

No user acceptance results have been supplied for the accumulated increments.
The latest development-host ordinary suite passed 7,139 tests with one skip;
allocation probes, browser/GPU acceptance and current live-source availability
remain separate checks.

## Remaining implementation backlog

These are candidates after validation, rather than promises that each will ship.

- [ ] Canonical publisher URLs: evaluate evidence-backed resolution of Google News
      links. Preserve original links and provenance; do not label an unresolved
      aggregator link as a verified publisher URL.
- [ ] Broader syndication analysis: assess quality with real examples before
      extending the conservative URL/headline grouping heuristic. Group membership
      must not imply independent corroboration or a confirmed incident.
- [ ] Independent-source telemetry: inventory loops outside manager-owned updates;
      add source-specific acquisition/retry history where the source supplies it.
- [ ] Optional configured-feed editing in the browser: first decide how local
      configuration is persisted and validated. Server-side HTTPS/DNS protections
      must continue to apply.
- [ ] Saved views/regions: define an explicit opt-in storage scope and migration
      policy; current monitoring filters are transient and excluded from share links.
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
