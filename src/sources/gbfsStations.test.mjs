import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStationInformation } from './gbfsStations.js';

const station = (fields = {}) => ({
  station_id: 's1',
  lat: 30.2681,
  lon: -97.7469,
  capacity: 13,
  ...fields,
});
const parseName = (fields, version) =>
  parseStationInformation({
    version,
    data: { stations: [station(fields)] },
  }).get('s1').name;

test('GBFS v2 station names remain trimmed strings', () => {
  assert.equal(
    parseName({ name: ' Republic Square ', short_name: 'Short' }, '2.3'),
    'Republic Square',
  );
});

test('GBFS v3 station names prefer English over the first translation', () => {
  assert.equal(
    parseName(
      {
        name: [
          { language: 'hu', text: 'Köztársaság tér' },
          { language: 'en', text: ' Republic Square ' },
        ],
      },
      '3.0',
    ),
    'Republic Square',
  );
});

test('English preference accepts case differences and regional language tags', () => {
  for (const language of ['EN', 'en-GB', 'En-US']) {
    assert.equal(
      parseName({
        name: [
          { language: 'hu', text: 'Hungarian' },
          { language, text: 'English' },
        ],
      }),
      'English',
    );
  }
});

test('without usable English text the first usable translation wins', () => {
  assert.equal(
    parseName({
      name: [
        null,
        { language: 'en', text: '  ' },
        { language: 'en', text: 42 },
        { language: 'hu', text: ' Első ' },
        { language: 'fr', text: 'Deuxième' },
      ],
    }),
    'Első',
  );
});

test('malformed language fields cannot abort translation selection', () => {
  const name = [
    null,
    false,
    'bad',
    {},
    { language: 42, text: 'Fallback' },
    { language: { unexpected: true }, text: 'Other' },
    { language: 'en', text: 'English' },
  ];
  assert.equal(parseName({ name }), 'English');
  assert.equal(
    parseName({ name: [{ text: ' Usable text without a locale ' }] }),
    'Usable text without a locale',
  );
});

test('a usable name takes precedence over an English short name', () => {
  assert.equal(
    parseName({
      name: [{ language: 'hu', text: 'Full name' }],
      short_name: [{ language: 'en', text: 'Short name' }],
    }),
    'Full name',
  );
});

test('missing, empty and malformed names fall back to localized short_name', () => {
  for (const name of [
    undefined,
    null,
    '',
    '  ',
    [],
    {},
    0,
    42,
    false,
    [null, {}, { language: 'en', text: [] }, { language: 'hu', text: ' ' }],
  ]) {
    assert.equal(
      parseName({
        name,
        short_name: [
          { language: 'hu', text: 'Rövid' },
          { language: 'en', text: ' Short ' },
        ],
      }),
      'Short',
    );
  }
});

test('localized names can fall back to legacy short_name strings', () => {
  assert.equal(parseName({ name: [], short_name: ' Short ' }), 'Short');
});

test('no usable name leaves the station available with an empty name', () => {
  for (const value of [
    undefined,
    null,
    '',
    [],
    {},
    42,
    true,
    [null, { text: false }, { language: 'en', text: ' ' }],
  ]) {
    assert.equal(parseName({ name: value, short_name: value }), '');
  }
});

test('name shape is normalized even when a feed omits or misstates its version', () => {
  const name = [{ language: 'en', text: 'Republic Square' }];
  for (const version of [undefined, '2.3', '3.0', '3.1', 'unknown']) {
    assert.equal(parseName({ name }, version), 'Republic Square');
    assert.equal(parseName({ name: 'Legacy name' }, version), 'Legacy name');
  }
});

test('bad names do not lose valid stations or their metadata', () => {
  const information = parseStationInformation({
    version: '3.0',
    data: {
      stations: [
        station({ station_id: 'bad', name: [null, {}] }),
        station({
          station_id: 'short',
          name: [],
          short_name: [{ language: 'en', text: 'Short' }],
        }),
        station({
          station_id: 'good',
          name: [{ language: 'en', text: 'Republic Square' }],
        }),
      ],
    },
  });
  assert.equal(information.size, 3);
  assert.equal(information.get('bad').name, '');
  assert.equal(information.get('short').name, 'Short');
  assert.deepEqual(information.get('good'), {
    stationId: 'good',
    name: 'Republic Square',
    lat: 30.2681,
    lon: -97.7469,
    capacity: 13,
    isInstalled: true,
    isRenting: true,
    isReturning: true,
  });
});

test('normalizing a localized name leaves the feed document unchanged', () => {
  const payload = {
    version: '3.0',
    data: {
      stations: [
        station({
          name: [
            { language: 'hu', text: 'Magyar' },
            { language: 'en', text: ' English ' },
          ],
        }),
      ],
    },
  };
  const original = structuredClone(payload);
  parseStationInformation(payload);
  assert.deepEqual(payload, original);
});

test('feed update time accepts seconds and explicit-zone RFC3339 without inventing receipt time', async () => {
  const { parseGbfsUpdatedAt } = await import('./gbfsStations.js');
  const at = Date.parse('2026-10-16T19:00:00Z');
  assert.equal(parseGbfsUpdatedAt(at / 1000), at);
  assert.equal(parseGbfsUpdatedAt('2026-10-16T21:00:00+02:00'), at);
  assert.equal(parseGbfsUpdatedAt('2026-10-16t19:00:00.123z'), at + 123);
  assert.equal(
    parseGbfsUpdatedAt('2024-02-29T00:00:00Z'),
    Date.parse('2024-02-29T00:00:00Z'),
  );
  for (const value of [
    undefined,
    null,
    true,
    {},
    [],
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    at,
    String(at / 1000),
    '2026-10-16',
    '2026-10-16T19:00:00',
    '2026-02-30T00:00:00Z',
    '2025-02-29T00:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-10-16T24:00:00Z',
    '2026-10-16T19:00:00+24:00',
    '2026-10-16T19:00:00+02:60',
    '2026-10-16T19:00:60Z',
    'x'.repeat(100),
  ])
    assert.equal(parseGbfsUpdatedAt(value), null, String(value));
});
