import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfiguredFeed } from './monitoringFeedXml.js';
import {
  configuredNewsFeeds,
  configuredFeedReader,
  fetchConfiguredNews,
} from './monitoringFeeds.js';
const URL = 'https://publisher.org/feeds/world.xml?token=private-fixture';
const NS = 'http://www.w3.org/2005/Atom';
const NOW = Date.UTC(2026, 9, 16, 12);
const entry = (body = '') =>
  `<entry><title>Peace &amp; diplomacy &#x2014; an international report</title>${body}</entry>`;
const atom = (body) => `<feed xmlns="${NS}">${body}</feed>`;
const link =
  '<link rel="alternate" type="text/html" href="../story?id=2&amp;lang=en"/>';

test('Atom default and prefixed namespaces preserve text, alternate article links and published time', () => {
  const xml = atom(
    entry(
      '<link rel="self" href="https://publisher.org/feed.atom"/>' +
        link +
        '<published>2026-10-16T13:00:00+02:00</published><updated>2026-10-16T11:30:00Z</updated>',
    ),
  );
  for (const source of [
    xml,
    xml
      .replace(
        /<(\/?)(feed|entry|title|link|published|updated)(\s|>)/g,
        '<$1a:$2$3',
      )
      .replace(`xmlns="${NS}"`, `xmlns:a="${NS}"`),
  ]) {
    const result = parseConfiguredFeed(source, URL);
    assert.equal(result.format, 'Atom');
    assert.equal(result.articles.length, 1);
    assert.equal(
      result.articles[0].title,
      'Peace & diplomacy — an international report',
    );
    assert.equal(
      result.articles[0].url,
      'https://publisher.org/story?id=2&lang=en',
    );
    assert.equal(result.articles[0].publishedAt, '2026-10-16T11:00:00.000Z');
    assert.equal(result.articles[0].timestampMeaning, 'Publication (Atom)');
  }
});

test('Atom update-only and invalid publication dates remain distinct from publication time', () => {
  for (const published of [
    '',
    '<published>2026-02-30T11:00:00Z</published>',
    '<published>2026-10-16T11:00:00</published>',
  ]) {
    const [row] = parseConfiguredFeed(
      atom(entry(link + published + '<updated>2026-10-16T11:00:00Z</updated>')),
      URL,
    ).articles;
    assert.equal(row.timestampMeaning, 'Update (Atom)');
    assert.equal(row.publishedAt, '2026-10-16T11:00:00.000Z');
  }
  const [unknown] = parseConfiguredFeed(
    atom(entry(link + '<updated>2026-10-16T25:00:00Z</updated>')),
    URL,
  ).articles;
  assert.equal(unknown.publishedAt, null);
  assert.equal(unknown.timestampMeaning, 'Publication/update (Atom)');
});

test('Atom xml:base, HTML/XHTML titles, default rel and source labels are plain bounded metadata', () => {
  const xml = `<feed xmlns="${NS}" xml:base="https://publisher.org/news/"><entry xml:base="region/"><title type="html">&lt;b&gt;Diplomacy&lt;/b&gt; &amp; peace</title><link href="story.html"/><source><title>Reported source</title></source></entry><entry><title type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">A <b>second</b> report</div></title><link href="second.html"/></entry></feed>`;
  const rows = parseConfiguredFeed(xml, URL).articles;
  assert.equal(rows[0].url, 'https://publisher.org/news/region/story.html');
  assert.equal(rows[0].title, 'Diplomacy & peace');
  assert.equal(rows[0].domain, 'Reported source');
  assert.equal(rows[1].title, 'A second report');
});

test('Atom never substitutes feed/self/enclosure/ID or unsafe links for an article', () => {
  const xml = atom(
    [
      '<link rel="self" href="https://publisher.org/feed"/>',
      '<link rel="enclosure" href="https://publisher.org/audio.mp3"/>',
      '<link type="application/atom+xml" href="https://publisher.org/entry.atom"/>',
      '<id>https://publisher.org/not-an-article-link</id>',
      '<link href="javascript:alert(1)"/>',
      '<link href="https://user:password@publisher.org/secret"/>',
      '<link href="#entry"/>',
      '<link href="  #entry"/>',
      '<link href="   "/>',
    ]
      .map((body) => entry(body))
      .join(''),
  );
  assert.equal(parseConfiguredFeed(xml, URL).articles.length, 0);
});

test('strict feed XML rejects malformed documents, DTDs, wrong namespaces and excessive resources', () => {
  for (const source of [
    '<feed xmlns="wrong"/>',
    '<feed/>',
    atom('<entry></feed>'),
    '<!DOCTYPE feed [<!ENTITY x "abc">]>' + atom(''),
    atom('<entry><title>&unknown;</title></entry>'),
    atom('<entry><link href=unquoted /></entry>'),
    '<rss><channel></rss>',
    '<rss/><rss/>',
    atom('<x>'.repeat(50) + '</x>'.repeat(50)),
    'x'.repeat(2 * 1024 * 1024 + 1),
  ])
    assert.throws(() => parseConfiguredFeed(source, URL));
  assert.equal(parseConfiguredFeed(atom(''), URL).articles.length, 0);
  assert.equal(
    parseConfiguredFeed('<rss><channel/></rss>', URL).articles.length,
    0,
  );
});

test('configured RSS retains publication meaning and handles CDATA, namespaces and relative links', () => {
  const xml =
    '<rss><channel><item attr="value"><title><![CDATA[<b>World</b> & diplomacy]]></title><link>../article</link><pubDate>Fri, 16 Oct 2026 11:00:00 GMT</pubDate></item ></channel></rss>';
  const [row] = parseConfiguredFeed(xml, URL).articles;
  assert.equal(row.title, 'World & diplomacy');
  assert.equal(row.url, 'https://publisher.org/article');
  assert.equal(row.timestampMeaning, 'Publication (RSS)');
});

test('Atom is cached, filtered and labelled through the existing configured-feed acquisition path', async () => {
  const feed = configuredNewsFeeds([
    {
      id: 'world',
      label: 'World feed',
      url: 'https://publisher.org/atom',
      refreshMinutes: 15,
    },
  ])[0];
  let calls = 0;
  const reader = configuredFeedReader({
    now: () => NOW,
    readFeed: async () => {
      calls++;
      return atom(entry(link + '<updated>2026-10-16T11:00:00Z</updated>'));
    },
  });
  const query = {
    provider: 'rss:world',
    keywords: 'diplomacy',
    region: '',
    hours: 24,
  };
  const result = await fetchConfiguredNews(query, [feed], reader, () => NOW);
  assert.equal(result.source, 'Configured Atom · World feed');
  assert.equal(result.articles[0].timestampMeaning, 'Update (Atom)');
  assert.equal(result.timeMeaning, 'Publication/update (Atom)');
  await fetchConfiguredNews(
    { ...query, keywords: 'missing' },
    [feed],
    reader,
    () => NOW,
  );
  assert.equal(calls, 1);
});

test('feed parser caps inspected entries, unique article URLs, XML tags and link length', () => {
  const duplicate = atom(entry(link) + entry(link));
  assert.equal(parseConfiguredFeed(duplicate, URL).articles.length, 1);
  const beyond = atom('<entry/>'.repeat(250) + entry(link));
  assert.equal(parseConfiguredFeed(beyond, URL).articles.length, 0);
  assert.equal(
    parseConfiguredFeed(
      atom(entry(`<link href="https://publisher.org/${'x'.repeat(2050)}"/>`)),
      URL,
    ).articles.length,
    0,
  );
  assert.throws(
    () => parseConfiguredFeed(atom('<entry/>'.repeat(25001)), URL),
    /limit/,
  );
});
