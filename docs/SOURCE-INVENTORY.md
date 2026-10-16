# Standalone source ownership inventory

Inspected 2026-10-16 against pinned upstream
`537e99dfa45a3f7b239ad6230a65be658b3ea29d` plus the documented customizations.
This is a source-code inventory, not a live-provider availability or browser test.

The roster is defined by [catalog construction](../src/app/constructCatalog.js),
[serialization IDs](../src/data/layerState.js) and the separate local-only ADS-B ID.
[Standalone source composition](../src/standalone/layerSources.js) selects providers;
[reference sources](../src/sources/reference.js) selects USGS, AQHI, perimeters,
GNSS and bundled cables. All 32 current catalog IDs are accounted for below.
Monitoring news is a separate surface and is listed after the roster.

Manager history describes manager-owned update calls, including updates that
perform no acquisition. A camera, selection, player or renderer can acquire data
outside those calls. A recent local completion is not an upstream observation.
The table records inspected boundaries; provider internals and every subrequest
are not exhaustively audited. Existing request policies remain unchanged.

## Current catalog

| Layer ID | Inspected entry points / ownership | Timestamp evidence and remaining gap |
| --- | --- | --- |
| `flights` | src/layers/flights/ingestion.js; tracking direct-refresh hook | Adapter acquisitionHealth covers manager/direct snapshot calls. Adapter observation time remains lastUpdate; fallback subrequests are separate. |
| `military` | src/layers/military/ingestion.js; src/layers/military/lifecycle.js | Separate military snapshot path, observation clock and retry deadline. General-flight acquisitionHealth must not be assumed to cover this path or classification initialization. |
| `local-adsb` | src/layers/localAdsb/index.js; receiver subscriptions and local render/sync timers | lastUpdate is newest merged message time, not necessarily a fresh position. Decoder/receiver acquisition is outside manager update. |
| `ais-live-vessels` | src/layers/vessels/ingestion.js; src/data/aisWatchdog.js | Server connection event history, valid message time and position-data time are distinct. Transport handshake does not date a position. |
| `bikeshare` | src/layers/bikeshare/ingestion.js; src/layers/bikeshare/viewport.js | Per-city adapter attempts/acceptance and operator feed-update claims now separate. Station last_reported and upstream acquisition provenance need separate assessment. |
| `transit` | src/layers/transit/ingestion.js; src/layers/transit/viewport.js; src/layers/transit/lifecycle.js | Manager and viewport can poll feeds; duplicate requests coalesce. Snapshot fetchedAt, x-transit-contact, stale-cache marker and vehicle reports already inform feed status. No common per-feed attempt timeline is added here. Maintenance interval is presentation, not a separate feed poll. |
| `traffic` | src/layers/traffic/ingestion.js; src/layers/traffic/viewport.js; src/layers/traffic/lifecycle.js | Viewport, enable kick and bounded retry can load roads outside manager calls. OpenFreeMap geometry and optional flow acquisition have distinct caches. Animated dots do not establish a newly observed vehicle. Inventory does not assign one acquisition clock to the composite. |
| `earthquakes` | src/layers/earthquakes/index.js; src/layers/earthquakes/source.js | Cancellable manager update; lastUpdate is local replacement time. Individual event occurrence time is separate. Monitoring reuses accepted rows instead of a second poll. |
| `air-quality` | src/layers/airQuality/index.js; src/layers/airQuality/source.js | lastUpdate is receipt; observedAt and observation-based stale classification already exist. A shared source-age consumer must not substitute receipt for measurement time. |
| `local-firms` | src/layers/firms/ingestion.js; src/layers/firms/lifecycle.js | Enable and manager update load snapshots; viewport LOD is rendering. fetchedAt is used when supplied, otherwise receipt. Detection acquisition time and server acquisition are distinct; receipt fallback remains a documented limitation. |
| `fire-perimeters` | src/layers/perimeters/index.js; src/layers/perimeters/source.js | Manager update replaces rows; lastUpdate is local acceptance, including identical snapshot acceptance. Selection-related InciWeb lookup/publication checks are another acquisition boundary. Browser source returns rows rather than whole proxy metadata. |
| `gnss-integrity` | src/layers/gnss/index.js; src/layers/gnss/source.js | Camera/retry refresh uses manager.refreshLayer when attached, with direct-update fallback. Source age reconstructs lastUpdate from ageMs. Camera changes are not always outside manager history. |
| `satellites` | src/layers/satellites/ingestion.js; src/layers/satellites/catalog.js | Core/dense acceptance and retained CelesTrak cache acquisition already distinguished. Propagation is not source acquisition; per-group attempt history remains separate work. |
| `rocket-launches` | src/layers/launches/ingestion.js; src/layers/launches/source.js | Launch documents plus optional active-TLE lookup and bounded post-TLE rebuild. Retry/rebuild can occur outside manager call. lastUpdate is local mission-build acceptance, not launch observation or TLE epoch. |
| `weather-radar` | src/layers/weather/index.js; src/layers/weather/source.js; shared weather clock | Manager manifest refresh plus selected/history frame acquisition and warming. lastUpdate/observedAt date the displayed observation; timeline playback is not a new observation. Manifest, frame and render paths need separate histories. |
| `weather-satellite` | src/layers/weather/index.js; src/layers/weather/source.js; shared weather clock | Same ownership family as radar, separate product/frame. Do not turn a selected historical image into a newly acquired observation. |
| `weather-lightning` | src/layers/weather/index.js; src/layers/weather/source.js; shared weather clock | Same ownership family, lightning product. Displayed-time evidence and browser frame acceptance remain distinct. |
| `weather-cyclones` | src/layers/cyclones/index.js; src/layers/cyclones/source.js | Snapshot update; selected advisory issuedAt supplies lastUpdate, with snapshot fetchedAt fallback when no storm selected. Selection can change timestamp meaning without a request. |
| `wind` | src/layers/wind/index.js; src/layers/wind/source.js | Manager and parameter-change direct updates. Forecast run time is source age; valid time is separate. Renderer/clock motion is not another forecast issue. |
| `cctv` | src/layers/cctv/ingestion.js; src/layers/cctv/lifecycle.js; src/layers/cctv/source.js | Update runs maintenance, geometry completion, health and auto-hop. lastUpdate is maintenance time, now explicitly marked; shared source age is unknown. Catalog, health, camera-frame and fallback imagery acquisitions need separate histories. |
| `street-level` | src/layers/streetLevel/index.js; src/layers/streetLevel/providers/mapillary/coverage.js; provider adapters | Manager update returns enabled state; coverage, nearest-photo, sequences and viewer loading belong to providers/user/map interaction. Core stats do not supply lastUpdate. Provider capture date is not viewer receipt. |
| `alpr-cameras` | src/layers/alpr/index.js; src/layers/alpr/source.js | Initial manager acquisition plus camera debounce/reuse/retry. lastUpdate is local mapped-location acceptance; it is not a live camera observation. |
| `military-installations` | src/layers/installations/ingestion.js; src/layers/installations/lifecycle.js; src/layers/installations/viewport.js | Viewport/camera drives mapped-site loading, exact retry and optional nearby-place supplementation. lastUpdate is local acceptance. Map feature age/verification cannot be inferred from it. |
| `radio` | src/layers/radio/ingestion.js; src/layers/radio/controls.js | Directory update retains updatedAt and accepted generation/stale/degraded evidence. This is directory provenance, not stream liveness. Audio tuning/playback acquisition needs its own inventory before instrumentation. |
| `recent-imagery` | src/layers/recentImagery/index.js; src/layers/recentImagery/catalog.js | update is empty; map/user search and thumbnail/render requests have separate ownership. lastUpdate is catalog-search acceptance, not imagery capture. Stats can follow map state when no controller subscription is present. |
| `directions` | src/layers/directions/index.js; src/layers/directions/source.js | update is empty; user endpoint/mode changes request routes with owned cancellation/timeout. lastUpdate is route acceptance. Playback/anchor timers are not traffic observations. |
| `telegeography-submarine-cables` | src/layers/submarineCables/ingestion.js; src/layers/submarineCables/bundledSource.js | Bundled asset fetches use force-cache; lastUpdate is local materialization. Camera hooks update presentation. No live cable-status or new publication-time claim. |
| `local-datacenters` | src/data/infrastructure.js; src/data/localGeojsonCore.js | Bundled/local GeoJSON loading and LOD. lastUpdate is local load completion, not facility change/verification. |
| `local-dams` | src/data/infrastructure.js; src/data/localGeojsonCore.js | Same local GeoJSON family; per-layer asset ownership. No live dam operating-status acquisition is established. |
| `military-awareness` | src/layers/awareness/ingestion.js; src/layers/awareness/lifecycle.js; src/layers/awareness/controls.js | Derived selected-subject evaluation over existing layers; lastUpdate is evaluatedAt. Context/render events are not independent corroboration or a new upstream feed. |
| `bhote-koshi-2026` | src/data/bhoteKoshiEvent.js | Fixed event reconstruction/media playback; update returns success and stats have no source refresh timestamp. Playback clock is not current event acquisition. |
| `bhote-koshi-locator` | src/data/bhoteKoshiLocator.js | Context/locator with boundary resolver and fixed presentations; stats have no lastUpdate. Resolver/asset availability does not establish a current incident feed. |

## Non-roster monitoring surface

src/standalone/monitoring.js, src/monitoring/news.js and
server/providers/monitoringFeeds.js own explicit news queries, cancellation,
accepted response time, retained source snapshot time and cache/cooldown evidence.
Configured-feed inventory retrieval is metadata, not a news search. Reports remain
unlocated unless actual coordinates are supplied; query region is not event location.
Saved views restore only filters and bounds, never acquisition or camera state.

## Prioritized follow-up work

1. CCTV: retain separate catalog/health/frame attempt and accepted-frame clocks,
   preserving selection/session ownership and distinguishing fallback imagery.
   This increment fixes the maintenance-as-source-age claim only. No frame
   freshness threshold or successful-frame timestamp is invented.
2. Timestamp semantics: explicitly label local acceptance in earthquakes,
   perimeters, launches, imagery and mapped/static layers before treating generic
   lastUpdate as a source observation clock. AQHI already has observedAt; derived
   awareness needs an evaluation label rather than a remote-source label.
3. Military snapshot path: assess dedicated request history separately from the
   general-flight adapter instrumentation.
4. Composite/viewport requests: traffic, weather frames, street-level providers,
   transit feeds, installation supplementation and radio playback need bounded
   per-channel ownership, not a global request wrapper that merges unlike clocks.
5. GBFS station reports and proxy acquisition: preserve feed-update versus station
   observation versus cache/receipt distinctions; current feed time alone cannot
   complete those gaps.

Each future slice should test cache reuse, no-acquisition updates, failure retention,
cancellation and retired generations; expose copied bounded metadata; and retain
existing request/retry policies. These are recommendations from inspected source,
not implementations or accepted browser behavior.
