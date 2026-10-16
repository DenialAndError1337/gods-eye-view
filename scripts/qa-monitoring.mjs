#!/usr/bin/env node
/** Fixture-only monitoring gate. Run against npm run dev; never needs provider keys. */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const index = process.argv.indexOf('--url');
const origin = index < 0 ? 'http://localhost:4173' : process.argv[index + 1];
const browser = await puppeteer.launch({
  headless: true,
  executablePath:
    process.env.PUPPETEER_EXECUTABLE_PATH || (await puppeteer.executablePath()),
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const errors = [];
  let quakeRequests = 0;
  let newsRequests = 0;
  let revision = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname === 'earthquake.usgs.gov') {
      quakeRequests++;
      return void request.respond({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              id: 'fixture-a',
              geometry: { type: 'Point', coordinates: [-97.7, 30.3, 10] },
              properties: {
                mag: 4.5,
                time: Date.now() - 60000,
                place: revision ? 'Revised fixture' : 'Austin fixture',
                url: 'https://earthquake.usgs.gov/earthquakes/eventpage/fixture-a',
              },
            },
            {
              type: 'Feature',
              id: 'fixture-b',
              geometry: { type: 'Point', coordinates: [140, 36, 20] },
              properties: {
                mag: 3.1,
                time: Date.now() - 7200000,
                place: 'Japan fixture',
              },
            },
          ],
        }),
      });
    }
    if (url.pathname === '/api/regional-brief') {
      newsRequests++;
      return void request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ready',
          newsStatus: 'ready',
          newsSource: 'Google News RSS',
          newsQuery: 'Austin',
          retrievedAt: new Date().toISOString(),
          articles: [
            {
              title: 'Fixture regional report',
              domain: 'Fixture publisher',
              publishedAt: null,
              url: 'https://news.google.com/rss/articles/fixture',
            },
          ],
        }),
      });
    }
    // Block outside services; geospatial UI and tests use local assets + controlled feed fixtures.
    if (
      url.origin !== new URL(origin).origin &&
      !['data:', 'blob:'].includes(url.protocol)
    )
      return void request.abort();
    void request.continue();
  });
  await page.goto(`${origin}/?welcome=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__godsEyeView?.dataManager, {
    timeout: 60000,
  });
  const explore = await page.$('[data-first-run-choice="explore"]');
  if (explore && (await explore.isVisible())) await explore.click();
  await page.click('#monitoring-toggle');
  const clickButton = async (label) => {
    const clicked = await page.evaluate((text) => {
      const node = [
        ...document.querySelectorAll('#monitoring-panel button'),
      ].find((n) => n.textContent.trim() === text);
      if (!node) return false;
      node.click();
      return true;
    }, label);
    assert.ok(clicked, `button exists: ${label}`);
  };
  await clickButton('Enable earthquakes');
  await page.waitForFunction(
    () => document.querySelectorAll('.monitoring-list li').length === 2,
  );
  assert.equal(newsRequests, 0);
  assert.equal(quakeRequests, 1);
  await page.click('.monitoring-list li button');
  assert.equal(
    await page.evaluate(() => window.__godsEyeView.viewer.selectedEntity.id),
    'earthquake:fixture-a',
  );
  // Exercise the same Cesium selection event used by a map pick, without pixel-position assumptions.
  await page.evaluate(() => {
    const app = window.__godsEyeView;
    const layer = app.dataManager.layers.get('earthquakes').module;
    app.viewer.selectedEntity = layer.getMonitoringEntity('fixture-b');
  });
  await page.waitForFunction(() =>
    document
      .querySelector('#monitoring-details')
      .textContent.includes('Japan fixture'),
  );
  await page.select('[data-filter="hours"]', '1');
  assert.equal(
    await page.$$eval('.monitoring-list li', (nodes) => nodes.length),
    1,
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.__godsEyeView.dataManager.layers
          .get('earthquakes')
          .module.getMonitoringEntity('fixture-b').show,
    ),
    false,
  );
  await clickButton('Reset filters');
  await page.click('.monitoring-list li button');
  revision++;
  await page.evaluate(async () => {
    const app = window.__godsEyeView;
    await app.dataManager.layers.get('earthquakes').module.update(app.viewer);
    app.dataManager._notifyListeners({
      type: 'fixture-refresh',
      layerId: 'earthquakes',
    });
  });
  await page.waitForFunction(() =>
    document
      .querySelector('#monitoring-details')
      .textContent.includes('Revised fixture'),
  );
  await page.evaluate(async () => {
    const app = window.__godsEyeView;
    const { Cartesian3 } =
      await import('/node_modules/cesium/Source/Cesium.js');
    app.viewer.camera.setView({
      destination: Cartesian3.fromDegrees(-97.7, 30.3, 600000),
    });
  });
  await clickButton('News at map center');
  await page.waitForFunction(() =>
    document
      .querySelector('.monitoring-counts')
      .textContent.includes('3 loaded'),
  );
  await page.select('[data-filter="category"]', 'report');
  await page.click('.monitoring-list li button');
  assert.match(
    await page.$eval('#monitoring-details', (n) => n.textContent),
    /Unlocated report/,
  );
  assert.equal(
    await page.$$eval(
      '#monitoring-details [data-action-id="locate"]',
      (n) => n.length,
    ),
    0,
  );
  assert.equal(newsRequests, 1);
  assert.equal(
    quakeRequests,
    2,
    'filters and news did not add earthquake acquisition',
  );
  await clickButton('Close');
  assert.equal(
    await page.evaluate(
      () =>
        window.__godsEyeView.dataManager.layers
          .get('earthquakes')
          .module.getMonitoringEntity('fixture-b').show,
    ),
    true,
  );
  await page.setViewport({ width: 390, height: 844 });
  await page.click('#monitoring-toggle');
  const layout = await page.$eval('#monitoring-panel', (node) => {
    const r = node.getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      screen: innerWidth,
      height: innerHeight,
    };
  });
  assert.ok(
    layout.left >= 0 &&
      layout.right <= layout.screen &&
      layout.top >= 0 &&
      layout.bottom <= layout.height,
  );
  await page.focus('#monitoring-panel button');
  await page.keyboard.press('Escape');
  assert.equal(await page.$eval('#monitoring-panel', (n) => n.hidden), true);
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    'monitoring-toggle',
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: fixture selection, filters, refresh identity, news provenance, no duplicate polling, close/reset and narrow layout.',
  );
} finally {
  await browser.close();
}
