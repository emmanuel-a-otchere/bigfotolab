import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Load createOutbox from source with injected storage/idb/crypto stubs
// (same source-extraction pattern as the other suites).
const src = await readFile(new URL('../src/common/outbox.js', import.meta.url), 'utf8');
const factorySrc = src
  .slice(src.indexOf('export function createOutbox'), src.indexOf('let defaultOutbox'))
  .replace('export function createOutbox', 'function createOutbox');

function makeOutbox({ post, upload } = {}) {
  let store = [];
  const storage = { get: () => store, set: (l) => { store = l; } };
  const createOutbox = new Function(
    'defaultStorage', 'idbPut', 'idbGet', 'idbDelete', 'indexedDB', 'crypto',
    factorySrc + '; return createOutbox;',
  )(
    () => storage,
    async () => true,
    async () => null,
    async () => {},
    undefined,
    { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
  );
  return createOutbox({ storage, post, upload });
}

test('enqueue assigns a uuid and persists to storage', async () => {
  const ob = makeOutbox();
  const uuid = await ob.enqueue({ type: 'state', fileId: 7, rating: 5 });
  assert.ok(uuid);
  assert.equal(ob.pendingCount(), 1);
  assert.equal(ob.list()[0].fileId, 7);
});

test('flush posts small actions as one batch and removes acknowledged ones', async () => {
  const sent = [];
  const ob = makeOutbox({
    post: async (cmd, args) => {
      sent.push([cmd, args]);
      return { results: args.actions.map((a) => ({ uuid: a.uuid, ok: true })) };
    },
  });
  const a = await ob.enqueue({ type: 'state', fileId: 1, rating: 4 });
  const b = await ob.enqueue({ type: 'sidecar', fileId: 2, comment: 'hello' });
  const r = await ob.flush();
  assert.equal(r.sent, 2);
  assert.equal(r.failed, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], 'apply_user_actions');
  assert.deepEqual(sent[0][1].actions.map((x) => x.uuid).sort(), [a, b].sort());
  assert.equal(ob.pendingCount(), 0);
});

test('flush keeps actions whose results are not ok (server-side dedup marks duplicates ok)', async () => {
  const ob = makeOutbox({
    post: async (cmd, args) => ({
      results: args.actions.map((a) => ({ uuid: a.uuid, ok: a.fileId !== 9 })),
    }),
  });
  await ob.enqueue({ type: 'state', fileId: 1, rating: 1 });
  await ob.enqueue({ type: 'state', fileId: 9, rating: 2 });
  const r = await ob.flush();
  assert.equal(r.sent, 1);
  assert.equal(r.failed, 1);
  assert.equal(ob.pendingCount(), 1);
  assert.equal(ob.list()[0].fileId, 9);
});

test('flush keeps everything queued when offline (post throws)', async () => {
  const ob = makeOutbox({ post: async () => { throw new Error('network down'); } });
  await ob.enqueue({ type: 'state', fileId: 3, isFavorite: true });
  const r = await ob.flush();
  assert.equal(r.sent, 0);
  assert.equal(r.failed, 1);
  assert.equal(ob.pendingCount(), 1);
});

test('media actions are routed to upload and dropped from the queue on success', async () => {
  const uploaded = [];
  const ob = makeOutbox({
    post: async () => ({ results: [] }),
    upload: async (action, blob) => { uploaded.push([action.destPath, blob]); },
  });
  // simulate a media action already carrying hasMedia (idb stubbed out in node)
  let store = [];
  const storage = { get: () => store, set: (l) => { store = l; } };
  const src2 = await readFile(new URL('../src/common/outbox.js', import.meta.url), 'utf8');
  const factorySrc2 = src2.slice(src2.indexOf('export function createOutbox'), src2.indexOf('let defaultOutbox'))
    .replace('export function createOutbox', 'function createOutbox');
  const createOutbox = new Function('defaultStorage', 'idbPut', 'idbGet', 'idbDelete', 'indexedDB', 'crypto',
    factorySrc2 + '; return createOutbox;')(
    () => storage, async () => true, async () => new Blob(['x']), async () => {}, undefined,
    { randomUUID: () => 'media-uuid' });
  const ob2 = createOutbox({ storage, post: async () => ({ results: [] }), upload: uploaded.length !== undefined ? async (a, b) => { uploaded.push([a.destPath, b]); } : null });
  const uuid = await ob2.enqueue({ type: 'replace_media', destPath: '/photos/a.jpg', mode: 'replace', expectedSha256: 'abc', file: new Blob(['x']) });
  const r = await ob2.flush();
  assert.equal(uuid, 'media-uuid');
  assert.equal(r.sent, 1);
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0][0], '/photos/a.jpg');
  assert.equal(ob2.pendingCount(), 0);
});
