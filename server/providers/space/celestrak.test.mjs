import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { celestrakProxy } from './celestrak.js';

test('CelesTrak proxy keeps acquisition time across cache hit, upstream failure and disk reload', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'gev-tle-'));
  let clock = 1000;
  let fail = false;
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (fail) throw new Error('fixture outage');
    return new Response('SAT\n1 fixture\n2 fixture');
  };
  const makeRequest = () => {
    let handler;
    celestrakProxy({ cacheDir, now: () => clock, fetchImpl }).configureServer({
      middlewares: {
        use: (route, callback) => {
          assert.equal(route, '/api/celestrak');
          handler = callback;
        },
      },
    });
    return async (group = 'stations') => {
      let status, headers, body;
      await handler(
        { url: `/${group}` },
        {
          headersSent: false,
          writeHead(s, h) {
            status = s;
            headers = h;
          },
          end(b) {
            body = b;
          },
        },
      );
      return { status, headers, body };
    };
  };
  try {
    const request = makeRequest();
    const fresh = await request();
    assert.equal(fresh.headers['x-tle-cache'], 'MISS');
    assert.equal(fresh.headers['x-tle-fetched-at'], '1000');
    clock += 500;
    const hit = await request();
    assert.equal(hit.headers['x-tle-cache'], 'HIT');
    assert.equal(hit.headers['x-tle-fetched-at'], '1000');
    assert.equal(calls, 1);
    clock += 7 * 3600000;
    fail = true;
    const stale = await request();
    assert.equal(stale.headers['x-tle-cache'], 'STALE-ERROR');
    assert.equal(stale.headers['x-tle-fetched-at'], '1000');
    assert.equal(stale.body, fresh.body);
    const disk = await makeRequest()();
    assert.equal(disk.headers['x-tle-fetched-at'], '1000');
    assert.equal(disk.headers['x-tle-cache'], 'STALE-ERROR');
    const missing = await request('visual');
    assert.equal(missing.status, 502);
    assert.equal(missing.headers['x-tle-fetched-at'], undefined);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});
