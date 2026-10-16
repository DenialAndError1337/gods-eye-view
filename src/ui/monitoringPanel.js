import { createRailCards } from './railCards.js';
import { syncRowList } from './rowList.js';
import { UiLifetime } from './uiLifetime.js';
import { earthquakeEvent, formatEventTime } from '../monitoring/events.js';
import { createMonitoringStore, eventMatches } from '../monitoring/store.js';
import { createMonitoringNews } from '../monitoring/news.js';
import { NEWS_TOPICS } from '../monitoring/newsQuery.js';

/** Opt-in monitoring surface; all globe access and acquisition are injected. */
export function createMonitoringPanel({
  document,
  anchor,
  readEarthquakes,
  subscribeEarthquakes,
  subscribeMapSelection,
  selectMapEvent,
  applyMapFilter,
  focusEvent,
  readMapArea,
  newsService,
  enableEarthquakes,
}) {
  const lifetime = new UiLifetime();
  const store = createMonitoringStore();
  let open = false;
  let destroyed = false;
  let syncingMap = false;
  let limit = 100;
  let timer;
  let quakeState = { rows: [], feedState: 'off', count: 0 };
  let newsState = {
    status: 'disabled',
    rows: [],
    context: '',
    lastSuccess: null,
  };
  const make = (tag, parent, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    parent.appendChild(node);
    return node;
  };
  const button = (parent, text, action) => {
    const node = make('button', parent, text, 'data-toggle-chip');
    node.type = 'button';
    lifetime.listen(node, 'click', action);
    return node;
  };
  const toggle = button(anchor, 'MONITOR', () => setOpen(!open));
  toggle.id = 'monitoring-toggle';
  toggle.setAttribute('aria-controls', 'monitoring-panel');
  toggle.setAttribute('aria-expanded', 'false');
  const panel = make('section', document.body, null, 'monitoring-panel');
  panel.id = 'monitoring-panel';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'monitoring-heading');
  const header = make('header', panel, null, 'monitoring-header');
  const heading = make('h2', header, 'MONITORING');
  heading.id = 'monitoring-heading';
  const close = button(header, 'Close', () => setOpen(false));
  close.setAttribute('aria-label', 'Close monitoring');
  const body = make('div', panel, null, 'monitoring-body');
  make(
    'p',
    body,
    'Recent USGS observations and geopolitical reporting. News is not independently corroborated.',
    'monitoring-intro',
  );
  const controls = make('div', body, null, 'monitoring-actions');
  const queryForm = make('form', body, null, 'monitoring-news-query');
  const queryFields = make('fieldset', queryForm);
  make('legend', queryFields, 'Geopolitical news search');
  const querySelect = (label, key, values) => {
    const wrap = make('label', queryFields, label);
    const input = make('select', wrap);
    input.dataset.newsQuery = key;
    for (const [value, text] of values) {
      const option = make('option', input, text);
      option.value = value;
    }
    input.value = values[0][0];
    return input;
  };
  const queryTopic = querySelect(
    'Topic',
    'topic',
    Object.entries(NEWS_TOPICS).map(([key, value]) => [key, value.label]),
  );
  const queryProvider = querySelect('Provider', 'provider', [
    ['auto', 'Google RSS, GDELT fallback'],
    ['google', 'Google News RSS'],
    ['gdelt', 'GDELT'],
  ]);
  const queryHours = querySelect('Search window', 'hours', [
    ['24', '24 hours'],
    ['48', '48 hours'],
    ['168', '7 days'],
  ]);
  const queryText = (label, key, maxLength) => {
    const wrap = make('label', queryFields, label);
    const input = make('input', wrap);
    input.type = 'text';
    input.value = '';
    input.maxLength = maxLength;
    input.dataset.newsQuery = key;
    return input;
  };
  const queryKeywords = queryText('Optional search phrase', 'keywords', 120);
  const queryRegion = queryText('Optional region text', 'region', 80);
  const submit = make('button', queryForm, 'Search news', 'data-toggle-chip');
  submit.type = 'submit';
  lifetime.listen(queryForm, 'submit', (event) => {
    event.preventDefault();
    notice.textContent = '';
    void news.search({
      topic: queryTopic.value,
      provider: queryProvider.value,
      hours: queryHours.value,
      keywords: queryKeywords.value,
      region: queryRegion.value,
    });
  });
  make(
    'p',
    queryForm,
    'Explicit search · up to 25 reports. Region text matches reporting; it does not locate incidents. Loaded-record filters below remain active.',
    'monitoring-help',
  );
  const enable = button(controls, 'Enable earthquakes', async () => {
    enable.disabled = true;
    try {
      if ((await enableEarthquakes()) === false)
        notice.textContent =
          'Earthquakes could not be enabled. Check Data Layers.';
    } catch {
      notice.textContent =
        'Earthquakes could not be enabled. Check Data Layers.';
    } finally {
      if (!destroyed) {
        enable.disabled = false;
        refresh();
      }
    }
  });
  button(controls, 'News at map center', () => {
    const area = readMapArea();
    if (!area?.point) {
      notice.textContent =
        'Point the map toward the ground, then request regional news.';
      return;
    }
    notice.textContent = '';
    void news.load(area.point);
  });
  const status = make('p', body, '', 'monitoring-health');
  status.setAttribute('role', 'status');
  const sourceDetail = make('p', body, '', 'monitoring-source-detail');
  const filters = make('fieldset', body, null, 'monitoring-filters');
  make('legend', filters, 'Shared filters');
  const select = (label, values, key, parse = (v) => v) => {
    const wrap = make('label', filters, label);
    const input = make('select', wrap);
    input.dataset.filter = key;
    for (const [value, text] of values) {
      const option = make('option', input, text);
      option.value = String(value);
    }
    lifetime.listen(input, 'change', () => {
      limit = 100;
      store.filter({ [key]: parse(input.value) });
    });
    return input;
  };
  const category = select(
    'Category',
    [
      ['all', 'All categories'],
      ['earthquake', 'Earthquakes'],
      ['report', 'News reports'],
    ],
    'category',
  );
  const source = select(
    'Source',
    [
      ['all', 'All sources'],
      ['USGS', 'USGS'],
      ['Google News RSS', 'Google News RSS'],
      ['GDELT fallback', 'GDELT fallback'],
      ['GDELT', 'GDELT'],
    ],
    'source',
  );
  const hours = select(
    'Time window',
    [
      [24, 'Last 24 hours'],
      [6, 'Last 6 hours'],
      [1, 'Last hour'],
      [0, 'All loaded records'],
    ],
    'hours',
    Number,
  );
  const keywordLabel = make('label', filters, 'Keyword in loaded records');
  const keyword = make('input', keywordLabel);
  keyword.type = 'search';
  keyword.value = '';
  keyword.maxLength = 120;
  keyword.dataset.filter = 'keyword';
  lifetime.listen(keyword, 'input', () => {
    limit = 100;
    store.filter({ keyword: keyword.value });
  });
  const publisher = select(
    'Publisher (loaded reports)',
    [['all', 'All publishers']],
    'publisher',
  );
  let publisherSignature = '';
  const check = (label, key) => {
    const wrap = make('label', filters, null, 'monitoring-check');
    const input = make('input', wrap);
    input.type = 'checkbox';
    input.checked = true;
    input.dataset.filter = key;
    make('span', wrap, label);
    lifetime.listen(input, 'change', () =>
      store.filter({ [key]: input.checked }),
    );
    return input;
  };
  const unknown = check('Include unknown times', 'includeUnknownTime');
  const unlocated = check(
    'Include unlocated reports in area filter',
    'includeUnlocated',
  );
  const areaControls = make('div', body, null, 'monitoring-actions');
  const boundsLabel = make(
    'p',
    body,
    'Geography: Global',
    'monitoring-source-detail',
  );
  button(areaControls, 'Use map bounds', () => {
    const area = readMapArea();
    if (!area?.bounds) {
      notice.textContent = 'A ground view is needed to define map bounds.';
      return;
    }
    store.filter({ bounds: area.bounds });
  });
  button(areaControls, 'Global', () => store.filter({ bounds: null }));
  button(areaControls, 'Reset filters', () => {
    limit = 100;
    store.reset();
  });
  make(
    'p',
    body,
    'Map filters affect earthquakes while this panel is open. News query context is not an incident location. Time windows compare each record’s labeled timestamp; coverage is limited to loaded feeds.',
    'monitoring-help',
  );
  const notice = make('p', body, '', 'monitoring-notice');
  notice.setAttribute('role', 'status');
  const counts = make('p', body, '', 'monitoring-counts');
  const listHeading = make('h3', body, 'Recent events & reports');
  listHeading.id = 'monitoring-list-heading';
  const list = make('ol', body, null, 'data-row-list monitoring-list');
  const empty = make('p', body, 'No matching loaded records.');
  const more = button(body, 'Show 100 more', () => {
    limit += 100;
    render(store.snapshot());
  });
  const details = make('div', body);
  details.id = 'monitoring-details';
  details.setAttribute('aria-label', 'Selected event details');
  const cards = createRailCards({ container: details });
  lifetime.listen(list, 'click', (event) => {
    const node = event.target.closest('[data-list-item-id]');
    if (node) store.select(node.dataset.listItemId);
  });
  // Claim Escape only within this nonmodal surface; globe keyboard controls remain available.
  lifetime.listen(
    panel,
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    },
    true,
  );
  const news = createMonitoringNews({
    service: newsService,
    publish(state) {
      newsState = state;
      store.replace('news', state.rows);
    },
  });
  function refresh() {
    if (!open || destroyed) return;
    quakeState = readEarthquakes();
    store.replace('earthquakes', quakeState.rows.map(earthquakeEvent));
  }
  function render(view) {
    if (!open || destroyed) return;
    const { rows, selected, filters: f } = view;
    const newsAge = Date.now() - Date.parse(newsState.lastSuccess);
    const newsStatus =
      ['nominal', 'empty'].includes(newsState.status) && newsAge > 300000
        ? 'stale'
        : newsState.status;
    category.value = f.category;
    source.value = f.source;
    hours.value = String(f.hours);
    keyword.value = f.keyword;
    const publisherNames = [
      ...new Set(view.all.map((row) => row.publisher).filter(Boolean)),
    ].sort();
    if (f.publisher !== 'all' && !publisherNames.includes(f.publisher))
      publisherNames.push(f.publisher);
    const signature = publisherNames.join('\n');
    if (signature !== publisherSignature) {
      publisherSignature = signature;
      for (const child of [...publisher.children]) child.remove();
      for (const name of ['all', ...publisherNames]) {
        const option = make(
          'option',
          publisher,
          name === 'all' ? 'All publishers' : name,
        );
        option.value = name;
      }
    }
    publisher.value = f.publisher;
    unknown.checked = f.includeUnknownTime;
    unlocated.checked = f.includeUnlocated;
    boundsLabel.textContent = f.bounds
      ? `Geography: ${f.bounds.west.toFixed(1)}° to ${f.bounds.east.toFixed(1)}° longitude · ${f.bounds.south.toFixed(1)}° to ${f.bounds.north.toFixed(1)}° latitude (captured map bounds)`
      : 'Geography: Global';
    status.textContent = `USGS: ${quakeState.feedState.toUpperCase()} · ${quakeState.count} loaded · News: ${newsStatus.toUpperCase()}`;
    enable.hidden = quakeState.feedState !== 'off';
    sourceDetail.textContent = [
      quakeState.refreshHealth?.lastAttempt
        ? `USGS update attempt ${new Date(quakeState.refreshHealth.lastAttempt).toISOString()} (${quakeState.refreshHealth.outcome})`
        : '',
      quakeState.refreshHealth?.lastSuccess
        ? `USGS successful update completion ${new Date(quakeState.refreshHealth.lastSuccess).toISOString()}`
        : '',
      quakeState.lastUpdate
        ? `USGS refreshed ${new Date(quakeState.lastUpdate).toISOString()}`
        : '',
      quakeState.error || '',
      newsState.context ? `News query: ${newsState.context}` : '',
      newsState.lastAttempt
        ? `News attempt ${new Date(newsState.lastAttempt).toISOString()} (${newsState.lastOutcome})`
        : '',
      newsState.lastAcceptedAt
        ? `News accepted ${new Date(newsState.lastAcceptedAt).toISOString()}`
        : '',
      newsState.lastSuccess
        ? `News source snapshot ${newsState.lastSuccess}`
        : '',
      newsState.error || '',
      newsState.retryAt > Date.now()
        ? `News cooldown (${newsState.retryReason || 'request spacing'}) until ${new Date(newsState.retryAt).toISOString().slice(11, 19)} UTC`
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const shown = rows.slice(0, limit);
    counts.textContent = `${view.all.length} loaded · ${rows.length} match · ${rows.filter((r) => !r.coordinates).length} unlocated · ${rows.filter((r) => r.timeMs == null).length} unknown time · showing ${shown.length}`;
    syncRowList(list, {
      ariaLabel: 'Events and reports, newest first; unknown times last',
      items: shown.map((row) => ({
        id: row.id,
        lead: row.category === 'earthquake' ? '◉' : '↗',
        text: `${row.title}\n${formatEventTime(row)} · ${row.timeMeaning} · ${row.source}`,
        active: row.id === view.selectedId,
      })),
    });
    empty.hidden = rows.length > 0;
    more.hidden = shown.length === rows.length;
    const lines = selected
      ? [
          `Type: ${selected.kind}`,
          `Source: ${selected.source}${selected.publisher ? ` · ${selected.publisher}` : ''}`,
          `${selected.timeMeaning}: ${formatEventTime(selected)}`,
          selected.coordinates
            ? `Location: ${selected.coordinates.lat.toFixed(4)}, ${selected.coordinates.lon.toFixed(4)} · ${selected.locationEvidence}`
            : selected.locationEvidence,
          selected.queryContext
            ? `Query context: ${selected.queryContext}`
            : '',
          selected.description || 'No description supplied.',
          selected.category === 'report'
            ? `News freshness: ${newsStatus}. Headline matches are reports, not verified incidents. Syndicated reports do not establish independent confirmation.`
            : `Feed: ${quakeState.feedState}. Epicenter/magnitude may be revised.`,
          selected.sourceUrl && !selected.originalUrl
            ? 'Source link may redirect. Original publisher URL has not been resolved.'
            : '',
          selected.sourceUrl ? '' : 'No original source URL supplied.',
        ].filter(Boolean)
      : [
          view.selectionNotice ||
            'Select an event or report to inspect its source and metadata.',
        ];
    cards.update([
      {
        id: 'monitoring-selection',
        title: selected?.title || 'Event details',
        badge: selected?.category || '',
        open: true,
        blocks: [
          {
            id: 'metadata',
            type: 'lines',
            lines: lines.map((text, i) => ({ id: String(i), text })),
          },
          {
            id: 'actions',
            type: 'actions',
            actions: selected
              ? [
                  ...(selected.coordinates
                    ? [
                        {
                          id: 'locate',
                          label: 'Locate on map',
                          onClick: () => focusEvent(selected),
                        },
                      ]
                    : []),
                  ...(selected.sourceUrl
                    ? [
                        {
                          id: `source-${selected.id}`,
                          label: 'Open source ↗',
                          href: selected.sourceUrl,
                        },
                      ]
                    : []),
                ]
              : [],
          },
        ],
      },
    ]);
    applyMapFilter((row) => eventMatches(earthquakeEvent(row), f));
    syncingMap = true;
    try {
      selectMapEvent(
        selected?.category === 'earthquake' ? selected.nativeId : null,
      );
    } finally {
      syncingMap = false;
    }
  }
  const unsubscribe = store.subscribe(render);
  const unsubscribeData = subscribeEarthquakes(refresh);
  const unsubscribeMap = subscribeMapSelection((nativeId) => {
    if (!open || syncingMap || destroyed) return;
    if (nativeId) store.select(`usgs:${nativeId}`);
    else if (store.snapshot().selected?.category === 'earthquake')
      store.select(null);
  });
  function tick() {
    if (!open || destroyed) return;
    refresh();
    timer = lifetime.timeout(tick, 30000);
  }
  function setOpen(value) {
    if (destroyed) return;
    open = value;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      tick();
      close.focus();
    } else {
      lifetime.cancelTimeout(timer);
      news.cancel();
      applyMapFilter(null);
      toggle.focus();
    }
  }
  return {
    destroy() {
      destroyed = true;
      news.destroy();
      lifetime.destroy();
      unsubscribe();
      unsubscribeData();
      unsubscribeMap();
      applyMapFilter(null);
      store.destroy();
      cards.destroy();
      panel.remove();
      toggle.remove();
    },
  };
}
