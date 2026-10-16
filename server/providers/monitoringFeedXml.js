import { DOMParser } from '@xmldom/xmldom';

const ATOM = 'http://www.w3.org/2005/Atom';
const XML = 'http://www.w3.org/XML/1998/namespace';

/** Linear resource preflight; XML grammar/namespace validation belongs to the parser. */
function preflight(xml) {
  if (
    typeof xml !== 'string' ||
    Buffer.byteLength(xml) > 2 * 1024 * 1024 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml)
  )
    throw new Error('Unsupported feed XML');
  let depth = 0,
    tags = 0,
    cursor = 0;
  while ((cursor = xml.indexOf('<', cursor)) !== -1) {
    const special = xml.startsWith('<!--', cursor)
      ? ['-->', 4]
      : xml.startsWith('<![CDATA[', cursor)
        ? [']]>', 9]
        : xml.startsWith('<?', cursor)
          ? ['?>', 2]
          : null;
    if (special) {
      const end = xml.indexOf(special[0], cursor + special[1]);
      if (end < 0) throw new Error('Invalid feed XML');
      cursor = end + special[0].length;
      continue;
    }
    const start = cursor++;
    let quote = null;
    for (; cursor < xml.length; cursor++) {
      const char = xml[cursor];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (cursor >= xml.length || ++tags > 25000)
      throw new Error('Feed XML limit exceeded');
    const tag = xml.slice(start, ++cursor);
    if (tag.startsWith('</')) depth--;
    else if (!/\/\s*>$/.test(tag)) depth++;
    if (depth < 0 || depth > 48) throw new Error('Feed XML depth exceeded');
  }
}
const children = (node, name, namespace = node.namespaceURI || '') =>
  Array.from(node.childNodes || []).filter(
    (child) =>
      child.nodeType === 1 &&
      child.localName === name &&
      (child.namespaceURI || '') === namespace,
  );
const first = (node, name, namespace) => children(node, name, namespace)[0];
const text = (node) =>
  String(node?.textContent || '')
    .slice(0, 8192)
    .replace(/\s+/g, ' ')
    .trim();
function title(node, stripHtml = false) {
  const value = text(node);
  return (
    stripHtml || node?.getAttribute('type') === 'html'
      ? value.replace(/<[^>]*>/g, ' ')
      : value
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}
function articleUrl(href, node, feedUrl) {
  href = String(href || '').trim();
  if (!href || href.startsWith('#') || href.length > 2048) return null;
  let base = feedUrl;
  const ancestors = [];
  for (
    let current = node;
    current?.nodeType === 1;
    current = current.parentNode
  )
    ancestors.unshift(current);
  try {
    for (const ancestor of ancestors) {
      const declared = ancestor.getAttributeNS(XML, 'base');
      if (declared) base = new URL(declared, base).href;
    }
    const url = new URL(href, base);
    return url.href.length <= 2048 &&
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
/** Atom RFC3339 timestamps require an explicit zone and a real calendar date. */
function atomTime(value) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i.exec(
      value,
    );
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (
    year < 1000 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Bounded configured RSS/Atom projection. No script execution, DTDs, external entities or article fetches. */
export function parseConfiguredFeed(xml, feedUrl) {
  preflight(xml);
  let document;
  try {
    document = new DOMParser({
      onError() {
        throw new Error('Invalid feed XML');
      },
    }).parseFromString(xml, 'application/xml');
  } catch {
    throw new Error('Invalid feed XML');
  }
  const root = document.documentElement;
  const atom = root?.localName === 'feed' && root.namespaceURI === ATOM;
  const rss =
    root?.localName === 'rss' && !root.namespaceURI && first(root, 'channel');
  if (!atom && !rss) throw new Error('Unsupported feed format');
  const nodes = atom ? children(root, 'entry') : children(rss, 'item');
  const articles = [],
    seen = new Set();
  for (const node of nodes.slice(0, 250)) {
    const headline = title(first(node, 'title'), !atom);
    let url = null;
    if (atom) {
      const links = children(node, 'link').filter(
        (link) =>
          (!link.getAttribute('rel') ||
            link.getAttribute('rel') === 'alternate') &&
          (!link.getAttribute('type') ||
            ['text/html', 'application/xhtml+xml'].includes(
              link.getAttribute('type').toLowerCase(),
            )),
      );
      for (const link of links) {
        url = articleUrl(link.getAttribute('href'), link, feedUrl);
        if (url) break;
      }
    } else url = articleUrl(text(first(node, 'link')), node, feedUrl);
    if (!headline || !url || seen.has(url)) continue;
    seen.add(url);
    const published = atom
      ? atomTime(text(first(node, 'published')))
      : Date.parse(text(first(node, 'pubDate')));
    const updated = atom ? atomTime(text(first(node, 'updated'))) : null;
    const publishedAt = atom
      ? published || updated
      : Number.isFinite(published)
        ? new Date(published).toISOString()
        : null;
    const timestampMeaning = atom
      ? published
        ? 'Publication (Atom)'
        : updated
          ? 'Update (Atom)'
          : 'Publication/update (Atom)'
      : 'Publication (RSS)';
    const source = first(node, 'source');
    articles.push({
      title: headline,
      url,
      domain:
        (atom ? title(source && first(source, 'title')) : text(source)).slice(
          0,
          80,
        ) || new URL(url).hostname.replace(/^www\./, ''),
      publishedAt,
      timestampMeaning,
      sourceCountry: null,
    });
  }
  return { format: atom ? 'Atom' : 'RSS', articles };
}
