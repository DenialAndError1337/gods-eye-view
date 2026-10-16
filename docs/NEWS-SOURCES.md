# Monitoring news — provider assessment and scope

Reviewed 2026-10-15 for the next TODO items. This increment reuses Google News RSS
and GDELT, already present in the application. It does not introduce a new provider
account, a configurable remote-feed URL, automated alerts, or public hosting.

## Provider decisions

| Provider        | Verified evidence                                                                                                                                               | Decision                                                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google News RSS | Live direct RSS request returned HTTP 200. New local topic endpoint returned HTTP 200 with 23 reports; the existing regional endpoint returned 5.               | Reuse the existing provider for explicit topic queries. Existing Google/publisher restrictions and attribution remain applicable; see DATA_SOURCES.md.              |
| GDELT DOC       | Existing integration and official DOC documentation support article search. A direct live check timed out after 12 seconds from this host.                      | Keep selectable GDELT and automatic fallback; do not claim verified current availability. Preserve the source-returned indexing timestamp meaning and article URLs. |
| ReliefWeb       | Official documentation requires a pre-approved appname. A read-only probe with an unapproved application name returned HTTP 403 with that specific requirement. | Defer integration until the user has an approved application identity. No registration request was submitted and no borrowed application name was used.             |

Official references:

- [ReliefWeb API application identity requirement](https://apidoc.reliefweb.int/parameters#appname)
- [ReliefWeb API documentation](https://apidoc.reliefweb.int/)
- [GDELT DOC 2.0 documentation](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)
- Existing provider attribution/licensing inventory: [DATA_SOURCES.md](../DATA_SOURCES.md)

These are reports indexed by the chosen service, not an exhaustive incident
catalog. Publisher/source attribution is retained. URL duplicates are suppressed;
syndicated headlines are not independent confirmation. No news coordinates are
inferred from a typed region or a query's geographic context.

## New behavior

**Search news** supports international affairs, diplomacy, security, conflict and
humanitarian topic presets; an optional phrase; optional region text; 24-hour,
48-hour or seven-day windows; and automatic/Google/GDELT provider choices. Terms
are bounded and quoted as plain text; source hosts are fixed in code. There is no
arbitrary URL input or browser-provided API key.

Search results are limited to 25 reports. GDELT receives the requested window.
Google RSS returns its own bounded matching feed; retained dated results are
filtered to the window, and unknown dates remain explicitly unknown. A larger
window does not promise exhaustive historical retrieval. The existing regional
cockpit route keeps its five-row behavior.

**Keyword in loaded records** and **Publisher** are local filters over the same
map/list cohort. They do not trigger acquisition. Search controls and loaded
filters are separate: filters remain active after a new query; Reset filters
restores defaults without fetching. Publisher filtering excludes observations
without that publisher rather than silently leaving incompatible rows visible.

## Reliability bounds

`/api/monitoring-news` accepts only validated GET queries. Invalid/repeated/unknown
parameters are refused before acquisition. Query text is sanitized and never
used as a URL. Upstream response/body size and 12-second per-provider deadlines
reuse the existing regional transport.

The endpoint has a five-minute cache, one-hour last-good limit, 64 cache entries,
per-query in-flight coalescing and at most four active acquisitions. A global
five-second start spacing and 30-second failure cooldown protect the providers;
request limits are 12/minute per client and 30/minute globally. Cache hits do not
fetch upstream. Malformed responses and total outages do not become healthy zero
results. A usable empty RSS response with a failed fallback is disclosed as partial.

Client request ownership is shared between region and topic searches. A newer
query aborts the old request and discards late completions; closing the panel
also cancels it. Stale cached results retain their original retrieval timestamp.
One provider failure does not alter the earthquake layer or other feed lifecycles.

## Acceptance evidence

Live checks used the actual USGS adapter and a Vite server plus HTTP client in the
same execution session. USGS returned 40 valid M2.5+ observations. The topic and
regional requests returned 23 and 5 reports respectively via Google News RSS.
Separate execution sessions could not reach the server's loopback listener; the
cloud browser also returned connection refused. This is not a browser or visual
acceptance pass, and it is not evidence that a provider is down.

Both serialized allocation suites were attempted without changing thresholds.
The focus probe and all 13 overlay workloads failed at the host's
`uv_resident_set_memory` measurement. Native GPU, pointer picking, long-duration
soak behavior and visual layout still require a compatible host. Current test
and gate results are recorded in [TODO.md](../TODO.md).
