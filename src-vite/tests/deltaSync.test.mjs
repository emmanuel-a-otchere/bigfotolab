import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Phase 3 slice 7 — delta sync: server sync-state fingerprint + SSE hello +
// client reconnect resync in transport.js.

const transportSrc = fs.readFileSync(new URL('../src/common/transport.js', import.meta.url), 'utf8');
const apiSrc = fs.readFileSync(new URL('../src/common/api.js', import.meta.url), 'utf8');
const serverSrc = fs.readFileSync(new URL('../../src-tauri/src/t_server.rs', import.meta.url), 'utf8');
const contentSrc = fs.readFileSync(new URL('../src/components/Content.vue', import.meta.url), 'utf8');
const mainSrc = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

function loadTransport({ fetchImpl, eventSourceClass }) {
  const body = transportSrc
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
    .replace(/export /g, '');
  const localStorageStub = {
    getItem: () => null,
    setItem: () => {},
  };
  return new Function(
    'tauriInvoke',
    'tauriListen',
    'localStorage',
    'fetch',
    'EventSource',
    body + '; return { configureTransport, setSyncStateProvider, getLastSyncState, listen, invoke, isRemote, getSessionId };',
  )(
    async () => { throw new Error('tauri invoke in remote test'); },
    async () => () => {},
    localStorageStub,
    fetchImpl,
    eventSourceClass,
  );
}

class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.handlers = new Map();
    this.onopen = null;
    FakeEventSource.last = this;
  }
  addEventListener(event, cb) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(cb);
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test('server exposes get_sync_state and sends server_hello on SSE connect', () => {
  assert.ok(serverSrc.includes('"get_sync_state" =>'), 'get_sync_state whitelisted in handle_cmd');
  assert.ok(serverSrc.includes('fn sync_state_json()'), 'sync_state_json helper exists');
  assert.ok(serverSrc.includes('"files_version"'), 'files fingerprint present');
  assert.ok(serverSrc.includes('"state_version"'), 'per-session state version present');
  assert.ok(serverSrc.includes('"collections_version"'), 'collections version present');
  assert.ok(serverSrc.includes('event: server_hello'), 'server_hello emitted on SSE connect');
});

test('client api.js and main.js wire the sync-state provider and listeners', () => {
  assert.ok(apiSrc.includes("invoke('get_sync_state'"), 'api.js getSyncState invokes get_sync_state');
  assert.ok(apiSrc.includes("listen('sync_state'"), 'api.js listenSyncState');
  assert.ok(apiSrc.includes("listen('server_hello'"), 'api.js listenServerHello');
  assert.ok(mainSrc.includes('setSyncStateProvider'), 'main.js registers the sync provider');
  assert.ok(contentSrc.includes("listen('sync_state'"), 'Content.vue refreshes the grid on sync_state');
});

test('transport resyncs on every SSE (re)connect and re-broadcasts changed versions', async () => {
  const fetchImpl = async (url, opts) => {
    if (url.includes('/api/v1/session')) {
      return { ok: true, json: async () => ({ session_id: 'sess-1' }) };
    }
    return { ok: true, json: async () => ({ result: {} }) };
  };
  const t = loadTransport({ fetchImpl, eventSourceClass: FakeEventSource });

  let state = { library_id: 'lib1', session_id: 'sess-1', files_version: '10:5:100', state_version: 1, collections_version: 3 };
  t.setSyncStateProvider(async () => state);

  // App startup order: transport is configured first, then listeners register.
  t.configureTransport({ mode: 'remote', url: 'http://srv:8080/', token: 'tok' });
  const seen = { sync: [], filesChanged: [], collectionsChanged: [] };
  await t.listen('sync_state', (p) => seen.sync.push(p));
  await t.listen('files-changed', (p) => seen.filesChanged.push(p));
  await t.listen('collections-changed', (p) => seen.collectionsChanged.push(p));
  await tick();
  await tick();
  const es = FakeEventSource.last;
  assert.ok(es, 'EventSource created');
  assert.ok(es.url.includes('token=tok'), 'token in SSE url');
  assert.ok(es.url.includes('sid=sess-1'), 'session id in SSE url');
  assert.equal(typeof es.onopen, 'function', 'onopen hook installed');

  // First connect: seeds lastSyncState, emits sync_state, no change events.
  es.onopen();
  await tick();
  await tick();
  assert.equal(seen.sync.length, 1);
  assert.equal(seen.sync[0].files_version, '10:5:100');
  assert.equal(seen.filesChanged.length, 0, 'no change event on first connect');
  assert.deepEqual(t.getLastSyncState().files_version, '10:5:100');

  // Reconnect with changed fingerprints: sync_state + both change events fire.
  state = { ...state, files_version: '11:6:101', collections_version: 4 };
  es.onopen();
  await tick();
  await tick();
  assert.equal(seen.sync.length, 2);
  assert.equal(seen.filesChanged.length, 1, 'files-changed re-broadcast on version change');
  assert.equal(seen.filesChanged[0].filesVersion, '11:6:101');
  assert.equal(seen.collectionsChanged.length, 1, 'collections-changed re-broadcast on version change');

  // Reconnect with unchanged state: only sync_state, no duplicate change events.
  es.onopen();
  await tick();
  await tick();
  assert.equal(seen.sync.length, 3);
  assert.equal(seen.filesChanged.length, 1);
  assert.equal(seen.collectionsChanged.length, 1);
});

test('transport resync is a no-op without a provider (desktop/tauri mode unaffected)', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ session_id: 's' }) });
  const t = loadTransport({ fetchImpl, eventSourceClass: FakeEventSource });
  t.configureTransport({ mode: 'remote', url: 'http://srv', token: 'tok' });
  const seen = [];
  await t.listen('sync_state', (p) => seen.push(p));
  await tick();
  await tick();
  FakeEventSource.last.onopen();
  await tick();
  await tick();
  assert.equal(seen.length, 0, 'no sync_state without provider');
  assert.equal(t.getLastSyncState(), null);
  assert.equal(t.isRemote(), true);
});
