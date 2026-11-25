// Offline outbox for remote (bigfotolab-server) mode.
//
// Small actions (state changes, sidecar edits) are queued in localStorage and
// flushed as one batched `apply_user_actions` call; media actions
// (replace_media / save_as_new) carry a Blob in IndexedDB and are flushed via
// POST /api/v1/media/upload. Server dedups by action uuid.
//
// The core is a factory (`createOutbox`) so tests can inject storage/fetch.

const LS_KEY = 'bigfotolab.outbox';
const IDB_NAME = 'bigfotolab-outbox-media';
const IDB_STORE = 'files';

function defaultStorage() {
  return {
    get() {
      try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
    },
    set(list) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* full/blocked */ }
    },
  };
}

function openMediaDb() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(key, blob) {
  const db = await openMediaDb();
  if (!db) return false;
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(blob, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

async function idbGet(key) {
  const db = await openMediaDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

async function idbDelete(key) {
  const db = await openMediaDb();
  if (!db) return;
  await new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export function createOutbox({ storage = defaultStorage(), post, upload } = {}) {
  function list() {
    return storage.get();
  }
  function save(list_) {
    storage.set(list_);
  }

  async function enqueue(action) {
    const a = { ...action, uuid: action.uuid || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()) };
    if (a.file instanceof Blob) {
      await idbPut(a.uuid, a.file);
      delete a.file;
      a.hasMedia = true;
    }
    const l = list();
    l.push(a);
    save(l);
    return a.uuid;
  }

  async function flush() {
    const pending = list();
    if (!pending.length) return { sent: 0, failed: 0 };
    const small = pending.filter((a) => !a.hasMedia);
    const media = pending.filter((a) => a.hasMedia);
    let sent = 0;
    let failed = 0;

    if (small.length && post) {
      try {
        const res = await post('apply_user_actions', { actions: small });
        const results = (res && res.results) || [];
        const okUuids = new Set(results.filter((r) => r.ok).map((r) => r.uuid));
        const failedUuids = new Set(results.filter((r) => !r.ok).map((r) => r.uuid));
        const remaining = list().filter((a) => a.hasMedia || !okUuids.has(a.uuid));
        for (const u of failedUuids) {
          if (list().some((a) => a.uuid === u)) failed++;
        }
        save(remaining);
        sent += okUuids.size;
      } catch {
        failed += small.length; // offline: keep everything queued
      }
    }

    for (const a of media) {
      if (!upload) { failed++; continue; }
      try {
        const blob = await idbGet(a.uuid);
        if (!blob) { failed++; continue; }
        await upload(a, blob);
        await idbDelete(a.uuid);
        save(list().filter((x) => x.uuid !== a.uuid));
        sent++;
      } catch {
        failed++; // keep queued for next flush
      }
    }
    return { sent, failed };
  }

  return { enqueue, flush, list, pendingCount: () => list().length };
}

let defaultOutbox = null;

export function getOutbox() {
  if (!defaultOutbox) {
    defaultOutbox = createOutbox();
  }
  return defaultOutbox;
}

// Wire the default outbox to the transport layer (remote mode only).
export async function initOutboxRemote() {
  const { isRemote, invoke, getServerUrl, getServerToken, getSessionId } = await import('@/common/transport');
  if (!isRemote()) return;
  const outbox = getOutbox();
  const post = (cmd, args) => invoke(cmd, args);
  const upload = async (action, blob) => {
    const params = new URLSearchParams({
      path: action.destPath,
      mode: action.mode === 'replace' ? 'replace' : 'new',
      token: getServerToken(),
    });
    if (getSessionId()) params.set('sid', getSessionId());
    if (action.expectedSha256) params.set('expected_sha256', action.expectedSha256);
    if (action.libraryId) params.set('library_id', action.libraryId);
    const res = await fetch(`${getServerUrl()}/api/v1/media/upload?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: blob,
    });
    if (!res.ok) throw new Error(`upload failed: HTTP ${res.status}`);
  };
  defaultOutbox = createOutbox({ post, upload });
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { defaultOutbox.flush(); });
  }
  await defaultOutbox.flush();
}
