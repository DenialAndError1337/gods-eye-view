# Monitoring

Open **MONITOR** in the globe actions bar. The panel is opt-in and local-first.
Opening it does not enable layers or fetch news. It is not shown in embedded panels.

- **Enable earthquakes** uses the existing USGS layer and its accepted snapshot.
  If already enabled, its records appear immediately. There is no second earthquake
  polling loop. Coverage is the existing trailing-day, magnitude 2.5+ feed.
- **News at map center** requests the existing regional briefing service explicitly.
  Point the camera toward the ground first. This is locality-matched reporting,
  not a global incident feed. Existing server caches, rate limits and source
  attribution apply. Repeat requests have a short cooldown; failures back off.
- Category, source, time and captured map bounds filter the same earthquake
  map/list cohort while the panel is open. **Global** clears the area constraint;
  **Reset filters** restores the 24-hour defaults. Time windows filter available
  records; they do not fetch historical data.
- Reports without coordinates remain in the list and details. An area query is
  context, not evidence of an article's event location. The area filter explicitly
  offers inclusion/exclusion of unlocated reports. Unknown timestamps are also
  controlled explicitly. UTC timestamps are labeled by meaning: earthquake
  occurrence, RSS publication, or GDELT indexing.
- Choose an earthquake on the map or in the list to synchronize the selection
  and details. The selected earthquake receives extra visual emphasis. Selection
  does not release a tracked aircraft or move the camera; **Locate on map** is
  the explicit navigation action and follows the existing camera ownership policy.
- News selections never place markers or move the camera. **Open source** uses a
  separate tab and retains the current view. Google RSS links may redirect; the
  interface says when a publisher-original URL has not been resolved.
- The list is newest first, unknown times last, and displays 100 rows at a time.
  **Show 100 more** expands it. Counts disclose loaded, matching, unlocated and
  unknown-time records. The filter applies to all accepted earthquake records,
  including ones beyond the displayed list page.
- Closing the panel removes its map filter and selection emphasis. It leaves
  layer visibility, tracking and existing share preferences under their usual
  owners. Monitoring filters are transient by default and are not saved into share links.
  Named filter views are stored locally only when explicitly saved.

Headlines are **reports, not independently corroborated incidents**. URL duplicates
collapse within a response; syndication across publishers is not treated as
independent confirmation. Missing descriptions and source URLs remain unknown.
News snapshots older than five minutes are labeled stale until explicitly refreshed.
Other layer source-status behavior remains under Data Layers.

## Topic search and loaded filters

Use **Search news** to choose international affairs, diplomacy, security, conflict
or humanitarian reporting. Add an optional search phrase and region text, choose
24 hours, 48 hours or seven days, and select the existing provider or automatic
fallback. The result is a bounded set of up to 25 reports; it is not an exhaustive
worldwide incident feed. Region text is search context and never places markers.

**Keyword in loaded records** and **Publisher** filter the loaded map/list cohort
without another network request. The publisher list comes from loaded reports.
Search controls do not clear your existing loaded-record filters; use Reset filters
or adjust the time window when needed. Changing a query discards late results from
the previous one. Original regional map-center news and cockpit behavior remain
available. See [provider assessment and limits](NEWS-SOURCES.md).

## Ownership

`src/monitoring/events.js` projects records without acquiring data.
`store.js` owns transient filters and selection; `news.js` owns cancellation and
cooldown for explicit regional queries. `src/ui/monitoringPanel.js` uses existing
keyed list/card controls. `src/standalone/monitoring.js` injects globe, navigation,
request and layer services; the portable application constructor is unchanged.

Earthquake rendering owns its accepted monitoring records, filter and emphasis.
Its source also retains the provider URL. Content-based fallback IDs avoid using
feed order when an upstream record lacks an ID; changes to that fallback record's
identifying fields can still change its synthetic identity.

The shared feed provenance vocabulary now includes `partial`, so a partial enabled
feed cannot fall through to an overall `off` classification.

## Verification

Run the ordinary repository gates and the focused suites:

```sh
node --test src/monitoring/monitoring.test.mjs src/ui/monitoringPanel.test.mjs src/layers/earthquakes/ownership.test.mjs src/data/layerSnapshot.test.mjs src/services/requests.test.mjs
npm run format:check
npm run check:boundaries
npm test
npm run build
```

For real browser fixture verification, start `npm run dev`, then run:

```sh
node scripts/qa-monitoring.mjs --url http://localhost:4173
```

The browser gate uses Puppeteer and an installed Chrome, or
`PUPPETEER_EXECUTABLE_PATH`. It mocks earthquake/news responses and blocks outside
requests. It exercises list/map-selection events, filters, refresh identity,
provenance, narrow layout, keyboard dismissal and restoration on close. A pointer
hit-test on rendered earthquake geometry and native GPU/long-duration behavior
remain separate visual acceptance checks. See `TODO.md` for the recorded run status.

No new providers, API keys, alerts, archive, risk scoring or public deployment are
included. The satellite stale-cache propagation finding from Priority 0 remains
outside this milestone.

## Related reports and provider preference

Reports with matching normalized URLs, or long matching headlines with known
timestamps inside 24 hours, receive a possible-related-report label. Reporting
counts include heuristic groups without hiding the individual rows. Select a
report to inspect its link provenance and open the other matching source links.
Groups reflect the currently loaded, filtered cohort; they are not confirmed
incidents or independent corroboration. See `NEWS-SOURCES.md` for exact limits.

Use **Remember provider on this device** to opt into remembering only the existing
provider selector. It does not persist search phrases, regions or result data, and
it never triggers acquisition automatically. Uncheck it to remove the preference.

## Configured RSS providers

The Provider dropdown also lists operator-configured RSS feeds after MONITOR is
opened. The inventory request itself does not acquire feed content. Choose one
and press **Search news**. RSS loads recent feed items: Topic is not applied;
phrase/region text matches headlines. Publication time and cache freshness stay
explicit. The opt-in provider preference can remember a configured feed ID only
after that ID is validated against the current inventory. See
[CONFIGURED-RSS.md](CONFIGURED-RSS.md) for setup and limits.

## Atom feeds and custom-source filters

Configured feed XML is detected as RSS or Atom 1.0. Atom `published` dates are
labelled publication; update-only entries are labelled **Update (Atom)**. Missing
or invalid entry times stay unknown. Source filters include loaded configured
feeds. The existing feed selector, remembered provider IDs, explicit search,
cache age and headline-filter semantics remain unchanged. Install the new pinned
XML dependency with `npm ci` after applying the Atom update.

## Saved filter views and regions

Use **Save/update view** to save up to 12 named filter presets on this browser/device.
A matching name (case insensitive) is replaced. Saved fields are category, source,
publisher, keyword, relative time window, unknown-time/unlocated inclusion and
optional captured map bounds. Keywords and regions can be sensitive on a shared
device. **Delete view** removes one preset; Reset filters does not delete presets.
Browser storage clearing can remove them. No server synchronization or export is added.

Choose a preset and press **Load view** to apply it to loaded records. Views never
auto-load, search, enable a layer or move the camera. Bounds can cross the antimeridian.
A saved time window remains relative to the current time; it is not an archive.
Unloaded sources/publishers remain selected and may match zero records. The news
search form, provider preference, results, selected record, camera and layer state
are excluded. The existing provider checkbox retains its original provider-only scope.

Storage uses the separate `gev.monitoring.views.v1` key with a version-1 envelope.
Reads validate the complete bounded inventory; writes first reread current storage.
No migration is needed for this first version. Malformed/unknown versions are kept
and block changes rather than being silently reset. Storage/quota errors are shown
without claiming a save succeeded. Future versions require an explicit migration.
