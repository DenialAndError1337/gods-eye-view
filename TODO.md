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
- [ ] Run a fresh full validation for the aircraft-health increment on the laptop;
      preserve the preceding all-green report as evidence for its own commit.
- [ ] Complete the browser fixture gate on a host where Chromium starts.
- [ ] Complete a 30–60 minute session with the intended layers enabled.
- [ ] Fix and retest reported regressions before advancing feature scope.

User reported full automated validation PASS on 2026-10-16 at 18:23 Europe/Brussels,
including both allocation probes, after npm ci installed the missing Atom parser.
Browser/live/GPU/long-session acceptance remains pending. The user authorized
parallel feature work while performing those manual checks.
The current increment's development-host ordinary run had 7,144 passes, three
failures and one skip. The two CCTV deadline failures passed isolated rechecks;
the traffic fixture clock was made deterministic and its navigation tests passed.
A fresh full-suite pass on the user's host is still required for this increment.
The previous user-machine all-green run remains evidence for its own version.

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
- [ ] Extend telemetry inventory to remaining layer families, and assess AIS
      transport connection-attempt history and bike-share per-city acquisition
      history without duplicating existing timers or requests.
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
