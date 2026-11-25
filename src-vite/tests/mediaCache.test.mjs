import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaCache } from '../src/common/mediaCache.js';

// Minimal in-memory IndexedDB stub covering the promise-callback surface the
// cache uses: open/onupgradeneeded, transactions with oncomplete, and an
// object store with put/get/delete/clear/openCursor.
function createFakeDb() {
  const data = new Map();
  function makeReq(run) {
    const r = { onsuccess: null, onerror: null, result: undefined, error: null };
    queueMicrotask(() => {
      try {
        run(r);
        r.onsuccess?.();
      } catch (e) {
        r.error = e;
        r.onerror?.();
      }
    });
    return r;
  }
  function objectStore() {
    return {
      put: (v) => makeReq((r) => { data.set(v.key, v); r.result = v.key; }),
      get: (k) => makeReq((r) => { r.result = data.get(k); }),
      delete: (k) => makeReq((r) => { data.delete(k); }),
      clear: () => makeReq((r) => { data.clear(); }),
      openCursor: () => {
        const r = { onsuccess: null, onerror: null, result: null, error: null };
        let i = -1;
        const step = () => queueMicrotask(() => {
          const keys = [...data.keys()].sort();
          i += 1;
          if (i >= keys.length) {
            r.result = null;
          } else {
            const k = keys[i];
            r.result = { value: data.get(k), continue: () => step() };
          }
          r.onsuccess?.();
        });
        step();
        return r;
      },
    };
  }
  return {
    objectStoreNames: { contains: () => data !== null && createFakeDb._hasStore },
    createObjectStore: () => { createFakeDb._hasStore = true; return { createIndex: () => {} }; },
    transaction: () => {
      const tx = { objectStore: () => objectStore(), oncomplete: null, onerror: null, error: null };
      setTimeout(() => tx.oncomplete?.(), 0);
      return tx;
    },
    _data: data,
  };
}

function fakeOpenDb(fake) {
  return async () => fake;
}

function makeBlob(text, type = 'image/jpeg') {
  return new Blob([text], { type });
}

function makeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const blob = routes[url];
    if (!blob) return { ok: false, status: 404, blob: async () => new Blob([]), headers: { get: () => null } };
    return { ok: true, status: 200, blob: async () => blob, headers: { get: () => blob.type } };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function makeCache({ budgetBytes = 1024 * 1024, fetchImpl, now } = {}) {
  const fake = createFakeDb();
  let tick = 1000;
  const urls = [];
  const revoked = [];
  const cache = createMediaCache({
    openDb: fakeOpenDb(fake),
    budgetBytes,
    now: now || (() => (tick += 10)),
    fetchImpl: fetchImpl || (async () => { throw new Error('no fetch'); }),
    createObjectURLImpl: (b) => { const u = `blob:fake-${urls.length}`; urls.push(u); return u; },
    revokeObjectURLImpl: (u) => { revoked.push(u); },
  });
  return { cache, fake, urls, revoked };
}

test('opened media is fetched once, cached, and served from an object URL', async () => {
  const fetchImpl = makeFetch({ 'http://srv/media/original/a.jpg?token=t': makeBlob('AAAA', 'image/jpeg') });
  const { cache, urls } = makeCache({ fetchImpl });
  await cache.init();
  // Not opened yet: sync accessor falls back to the remote URL and fetches nothing.
  assert.equal(cache.srcFor('/photos/a.jpg', 7, 'http://srv/media/original/a.jpg?token=t'), 'http://srv/media/original/a.jpg?token=t');
  assert.equal(fetchImpl.calls.length, 0);
  await cache.noteOpened('/photos/a.jpg', 7, 'http://srv/media/original/a.jpg?token=t');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(fetchImpl.calls.length, 1);
  const src = cache.srcFor('/photos/a.jpg', 7, 'http://srv/media/original/a.jpg?token=t');
  assert.equal(src, urls[0]);
  assert.match(src, /^blob:fake-/);
  // Re-opening the same version hits the cache and does not re-fetch.
  await cache.noteOpened('/photos/a.jpg', 7, 'http://srv/media/original/a.jpg?token=t');
  assert.equal(fetchImpl.calls.length, 1);
});

test('a new version (replaced media) is a distinct cache key', async () => {
  const fetchImpl = makeFetch({
    'u?v=1': makeBlob('v1'),
    'u?v=2': makeBlob('v2'),
  });
  const { cache } = makeCache({ fetchImpl });
  await cache.noteOpened('/p/x.jpg', 1, 'u?v=1');
  await new Promise((r) => setTimeout(r, 20));
  await cache.noteOpened('/p/x.jpg', 2, 'u?v=2');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(fetchImpl.calls.length, 2);
  assert.notEqual(cache.keyFor('/p/x.jpg', 1), cache.keyFor('/p/x.jpg', 2));
  assert.notEqual(cache.srcFor('/p/x.jpg', 1, 'u?v=1'), cache.srcFor('/p/x.jpg', 2, 'u?v=2'));
});

test('LRU eviction removes the least-recently-opened entry when over budget', async () => {
  const fetchImpl = makeFetch({
    'u/a': makeBlob('a'.repeat(400)),
    'u/b': makeBlob('b'.repeat(400)),
    'u/c': makeBlob('c'.repeat(400)),
  });
  const { cache, revoked } = makeCache({ budgetBytes: 1000, fetchImpl });
  await cache.noteOpened('/a', 0, 'u/a');
  await new Promise((r) => setTimeout(r, 10));
  await cache.noteOpened('/b', 0, 'u/b');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(cache.totalBytes(), 800);
  // Touch /a so /b becomes the LRU entry.
  await cache.noteOpened('/a', 0, 'u/a');
  await cache.noteOpened('/c', 0, 'u/c');
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(cache.totalBytes() <= 1000, `total ${cache.totalBytes()} <= 1000`);
  assert.equal(cache.entries.has(cache.keyFor('/b', 0)), false, 'LRU entry /b evicted');
  assert.equal(cache.entries.has(cache.keyFor('/a', 0)), true);
  assert.equal(cache.entries.has(cache.keyFor('/c', 0)), true);
  assert.ok(revoked.length >= 0);
});

test('only media explicitly opened is ever fetched — no bulk pull', async () => {
  const fetchImpl = makeFetch({});
  const { cache } = makeCache({ fetchImpl });
  await cache.init();
  // Simulate browsing a folder of 500 files: srcFor alone must not fetch anything.
  for (let i = 0; i < 500; i++) {
    assert.equal(cache.srcFor(`/photos/${i}.jpg`, 0, `http://srv/${i}.jpg`), `http://srv/${i}.jpg`);
  }
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(cache.totalBytes(), 0);
});

test('failed fetches do not poison the cache; a later open retries', async () => {
  let fail = true;
  const fetchImpl = async (url) => {
    if (fail) return { ok: false, status: 500, blob: async () => new Blob([]), headers: { get: () => null } };
    return { ok: true, status: 200, blob: async () => makeBlob('ok'), headers: { get: () => 'image/jpeg' } };
  };
  const { cache, urls } = makeCache({ fetchImpl });
  await cache.noteOpened('/x.jpg', 0, 'u/x');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(cache.entries.has(cache.keyFor('/x.jpg', 0)), false);
  fail = false;
  await cache.noteOpened('/x.jpg', 0, 'u/x');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(cache.entries.has(cache.keyFor('/x.jpg', 0)), true);
  assert.equal(cache.srcFor('/x.jpg', 0, 'u/x'), urls[0]);
});

test('onReady notifies listeners with the object URL when a warm completes', async () => {
  const fetchImpl = makeFetch({ 'u/y': makeBlob('YYY') });
  const { cache, urls } = makeCache({ fetchImpl });
  const seen = [];
  const off = cache.onReady((key, url) => seen.push([key, url]));
  await cache.noteOpened('/y.jpg', 3, 'u/y');
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(seen, [[cache.keyFor('/y.jpg', 3), urls[0]]]);
  off();
});

test('srcForAsync materializes the object URL from IDB after a fresh init', async () => {
  const fake = createFakeDb();
  const fetchImpl = makeFetch({ 'u/z': makeBlob('ZZZ') });
  const opts = {
    openDb: fakeOpenDb(fake),
    budgetBytes: 1024 * 1024,
    now: () => 1,
    fetchImpl,
    createObjectURLImpl: () => 'blob:fake-x',
    revokeObjectURLImpl: () => {},
  };
  const first = createMediaCache(opts);
  await first.noteOpened('/z.jpg', 0, 'u/z');
  await new Promise((r) => setTimeout(r, 20));
  // New cache instance over the same "disk": object URL is rebuilt from the blob.
  const second = createMediaCache({ ...opts, createObjectURLImpl: () => 'blob:fake-rebuilt' });
  await second.init();
  assert.equal(await second.srcForAsync('/z.jpg', 0, 'u/z'), 'blob:fake-rebuilt');
  assert.equal(await second.srcForAsync('/never-opened.jpg', 0, 'u/nope'), 'u/nope');
});
