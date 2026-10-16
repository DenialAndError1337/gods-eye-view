# Configured monitoring RSS and Atom feeds

Configure an operator-selected inventory of up to eight RSS or Atom 1.0 feeds, then select
one in **MONITOR → Provider**. Feed format is detected from XML; existing IDs and configuration remain valid. No custom feeds are enabled by default. Existing
Google RSS/GDELT behavior remains available.

## Setup

Add a single-line JSON array to your private project-root `.env` file:

```dotenv
GEV_NEWS_FEEDS='[{"id":"world","label":"My world feed","url":"https://YOUR-PUBLISHER/feed.xml","refreshMinutes":15}]'
```

Replace the placeholder URL with the publisher's actual final public HTTPS RSS
or Atom URL. This example is a template, not an enabled or verified source. Use feeds you
are permitted to consume, preserve publisher attribution, and set the interval
at least as long as the publisher requires. No new provider registrations or
licence permissions are supplied by this feature.

Stop the development server, then start it again with `npm run dev`. Reload the
page and open MONITOR. The Provider dropdown includes each configured feed.
Choose it and press **Search news**. Opening MONITOR retrieves local inventory
metadata only; it does not fetch any feed. Inventory changes require a full app
restart and page reload.

| Setting          | Rule                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `id`             | Unique lowercase ID: starts with a letter, then letters, digits or hyphens; up to 32 characters             |
| `label`          | Nonempty display label, up to 80 characters                                                                 |
| `url`            | Final public HTTPS RSS/Atom URL, up to 2,048 characters; standard port, no embedded credentials or fragment |
| `refreshMinutes` | Integer 5–1,440; default 15; minimum spacing between attempts to this feed, including failed attempts       |

One invalid entry disables the custom inventory and produces a generic local
configuration error. Built-in Google/GDELT queries still work. The metadata API
publishes IDs, labels, hosts and refresh intervals; it does not expose complete
feed URLs, query parameters or credentials. Keep private configuration out of Git.

## Search meaning

A configured RSS or Atom feed supplies recent items, not a searchable geopolitical index.
The **Topic** selector is **not applied** to RSS. Optional phrase and region text
are both matched literally and case-insensitively against headlines; they do not
locate incidents. The time window filters known publication times. Unknown dates
remain unknown and follow the monitoring panel's existing unknown-time filter.

The adapter examines the first 250 direct feed items/entries and returns up to 25
matching reports. Results are not exhaustive historical coverage. Existing loaded
keyword, publisher and geography filters remain active. RSS dates remain publication timestamps. Atom uses a valid `published` timestamp
when supplied, otherwise a valid `updated` timestamp labelled **Update (Atom)**.
Missing/invalid dates stay unknown. Atom timestamps require an explicit zone and
a real calendar date; feed acquisition is never substituted for entry time. Query context
never supplies coordinates. Aggregator/article-link and related-report labels
continue to apply; these remain reports rather than independently corroborated
incidents.

## Cache and source health

A per-feed raw cache is shared across phrase/region query variations. Concurrent
loads coalesce; changing query does not bypass source spacing. Fresh cache reads
retain the original acquisition timestamp. After a refresh failure, a last-good
copy can be served stale for up to one hour beyond the configured refresh
interval. Once expired it is unavailable. Failed attempts also respect the feed's
configured interval. Stale fallback never advances acquisition time or presents
itself as a healthy refresh.

The monitoring freshness threshold follows the configured interval, bounded to
5 minutes–24 hours. This describes the feed snapshot's acquisition age, not the
age or verification of its individual articles. Searches remain explicit; the
interval is a minimum request spacing, not an automatic refresh schedule.
Existing endpoint request limits, query cache and global cooldown still apply.

## Supported transport and format

Public DNS addresses are validated and pinned to the HTTPS request. Literal IPs,
private/local/reserved destinations and mixed public/private DNS answers are
refused. Redirects are not followed: configure the final feed URL. Requests carry
no browser cookies or operator authorization headers. Acquisition has a 12-second
whole-operation deadline and a 2 MiB response cap. Compressed responses are
refused; the request asks for identity encoding.

The configured-feed path now uses `@xmldom/xmldom` 0.9.12 on the server. Run
`npm ci` after applying this update; package.json and the lockfile are included.
DTD/entity declarations are refused before parsing. XML parse warnings/errors
fail the request; malformed XML is not treated as a successful empty feed.
Input remains capped at 2 MiB, with a preflight limit of 25,000 tags and nesting
depth 48. A well-formed empty RSS channel or Atom feed is a valid empty result.

Supported formats are conventional unnamespaced RSS item/title/link/pubDate/source
and Atom 1.0 (`http://www.w3.org/2005/Atom`), including default or prefixed
namespaces. RSS 1.0/RDF, Atom 0.3, HTML discovery, custom authorization headers
and schema validation are not included.

Atom accepts direct entry links whose `rel` is absent or `alternate`, with an
absent type, `text/html` or `application/xhtml+xml`. Self, enclosure and feed/XML
links are not substituted for article links. IDs, including URL-shaped IDs, are
not assumed to be article URLs. Relative article URLs honor inherited `xml:base`
and otherwise resolve against the configured feed URL. Credential-bearing,
non-HTTP(S), fragment-only, empty and overlong article links are skipped. Opening
retains the resolved provider-reported URL; no canonical-publisher claim is made.

Text, escaped HTML and XHTML titles become bounded plain-text metadata. Nothing
from the feed is rendered as executable markup. The backend deduplicates exact
article URLs; the monitoring panel continues to label broader headline/link
matches as heuristic groups. The Source dropdown now includes loaded custom
feeds as well as the existing built-in choices. Groups and filters do not add
provider requests.

No publisher page or canonical URL is fetched by this feature. The built-in
Google RSS/GDELT paths retain their established normalizers.

## Verification and remaining work

Fixture tests cover inventory limits, destination validation, pinned HTTPS
lookup, redirect/body-size/deadline refusal, cache/coalescing/cooldown/stale expiry,
query isolation, publication provenance and UI request ownership. These do not
establish the current availability or licence of any operator-selected feed.

Canonical publisher URL evidence, a browser inventory editor,
broader syndication analysis, and browser/GPU/long-session acceptance remain
follow-up work. ReliefWeb still requires an approved application identity.

## Atom acceptance snapshot

Focused fixtures cover default/prefixed namespaces, relative links and xml:base,
plain-text titles, published versus updated semantics, invalid dates and missing
zones, no ID/self/enclosure fallback, resource limits, valid empty feeds, strict
malformed-feed rejection, cache reuse and the shared Source filter. Real browser,
GPU and operator-selected live-feed acceptance still require follow-up.
