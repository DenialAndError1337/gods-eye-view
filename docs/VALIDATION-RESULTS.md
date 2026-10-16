# Validation results

Created 2026-10-16. **User acceptance pending.** This template contains no claimed
manual passes. Follow [VALIDATION-RUNBOOK.md](VALIDATION-RUNBOOK.md).
Keep a dated copy/section for each tested commit so later fixes do not erase history.

## Session

- Date/time and timezone:
- Tested commit (`git rev-parse HEAD`):
- Branch and uncommitted changes:
- Installed increments:
- OS / browser / screen size:
- Node / npm:
- Configured providers (labels only, no secrets):
- Tester:

## Outcomes

Allowed statuses: PASS, FAIL, BLOCKED, NOT RUN. Add evidence/details when changing a status.

| Checks                                                               | Status  | Evidence / failed IDs |
| -------------------------------------------------------------------- | ------- | --------------------- |
| S1–S7: startup, monitoring, quakes, selection, bounds, close         | NOT RUN |                       |
| N1–N8: news, provenance, filters, grouping, preference, cancellation | NOT RUN |                       |
| F1–F5: configured RSS/Atom, if configured                            | NOT RUN |                       |
| H1–H4: source health and refresh history                             | NOT RUN |                       |
| R1–R2: existing workflows, desktop/narrow/keyboard                   | NOT RUN |                       |
| R3: 30–60 minute observation                                         | NOT RUN |                       |
| Focused automated command                                            | NOT RUN |                       |
| npm test, including allocation probes                                | NOT RUN |                       |
| npm run build                                                        | NOT RUN |                       |
| npm run format:check                                                 | NOT RUN |                       |
| npm run check:boundaries                                             | NOT RUN |                       |
| Layer-token compatibility                                            | NOT RUN |                       |
| git diff --check                                                     | NOT RUN |                       |
| Puppeteer browser fixture gate                                       | NOT RUN |                       |

Split a row into individual IDs if outcomes differ. A row cannot be PASS if
some of its checks remain blocked or unattempted.

## Findings and retests

Copy this block for each finding:

- Check ID / status:
- Tested commit / date:
- Reproduction steps:
- Expected:
- Actual:
- Sanitized console / HTTP evidence:
- Impact / workaround:
- Fix commit:
- Retest date / result:

## Acceptance decision

- Core checks accepted: pending
- Outstanding failures / blocked checks:
- Next bounded change agreed:

Development-host automated evidence and limitations are in [DONE.md](../DONE.md)
and the [historical log](history/IMPLEMENTATION-LOG.md); do not copy those results
into this session as though they were observed on the user's machine.
