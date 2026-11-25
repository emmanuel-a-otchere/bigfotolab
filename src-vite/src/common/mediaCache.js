// Opened-media LRU cache for remote (bigfotolab-server) mode.
// Only originals the user actually opened at this endpoint are stored
// (IndexedDB blobs), byte-budgeted with LRU eviction — the client never
// bulk-pulls library media. Thumbnails/previews stay on HTTP caching only.
// Offline-committed edits sync back separately through the outbox.

const DB_NAME = 'bigfotolab-media-cache';
const DB_VERSION = 1;
const STORE = 'originals';
const DEFAULT_BUDGET_BYTES = 2048 * 1024 * 1024;

function defaultOpenDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('byLastOpened', 'lastOpened');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexedDB open failed'));
  });
}

export function createMediaCache(options = {}) {
  const openDb = options.openDb || defaultOpenDb;
  const budgetBytes = options.budgetBytes ?? DEFAULT_BUDGET_BYTES;
  const now = options.now || (() => Date.now());
  const fetchImpl = options.fetchImpl || ((...a) => fetch(...a));
  const createObjectURLImpl = options.createObjectURLImpl || ((b) => URL.createObjectURL(b));
  const revokeObjectURLImpl = options.revokeObjectURLImpl || ((u) => URL.revokeObjectURL(u));

  let dbPromise = null;
  let ready = false;
  const entries = new Map(); // key -> { size, lastOpened, objectUrl }
  const inFlight = new Map(); // key -> Promise<objectUrl|null>
  const listeners = new Set();

  const db = () => (dbPromise ||= openDb());

  function keyFor(filePath, version = 0) {
    return `${filePath}#${Number(version) || 0}`;
  }

  async function init() {
    if (ready) return;
    const d = await db();
    const all = await new Promise((resolve, reject) => {
      const out = [];
      const tx = d.transaction(STORE, 'readonly');
      const cursorReq = tx.objectStore(STORE).openCursor();
      cursorReq.onsuccess = () => {
        const c = cursorReq.result;
        if (c) {
          const v = c.value;
          out.push({ key: v.key, size: v.size, lastOpened: v.lastOpened });
          c.continue();
        } else {
          resolve(out);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
    for (const e of all) entries.set(e.key, { size: e.size, lastOpened: e.lastOpened, objectUrl: null });
    ready = true;
  }

  function totalBytes() {
    let t = 0;
    for (const e of entries.values()) t += e.size;
    return t;
  }

  async function evictToBudget() {
    const d = await db();
    while (totalBytes() > budgetBytes && entries.size > 0) {
      let oldestKey = null;
      let oldestTs = Infinity;
      for (const [k, e] of entries) {
        if (e.lastOpened < oldestTs) {
          oldestTs = e.lastOpened;
          oldestKey = k;
        }
      }
      if (oldestKey === null) break;
      const e = entries.get(oldestKey);
      entries.delete(oldestKey);
      if (e.objectUrl) revokeObjectURLImpl(e.objectUrl);
      await new Promise((resolve, reject) => {
        const tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(oldestKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  }

  async function put(key, blob, contentType) {
    await init();
    const d = await db();
    const rec = {
      key,
      blob,
      size: blob.size,
      contentType: contentType || blob.type || 'application/octet-stream',
      lastOpened: now(),
    };
    await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const prev = entries.get(key);
    if (prev?.objectUrl) revokeObjectURLImpl(prev.objectUrl);
    entries.set(key, { size: rec.size, lastOpened: rec.lastOpened, objectUrl: prev?.objectUrl || null });
    await evictToBudget();
    return rec;
  }

  async function touch(key) {
    const e = entries.get(key);
    if (!e) return;
    e.lastOpened = now();
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const rec = getReq.result;
        if (rec) {
          rec.lastOpened = e.lastOpened;
          store.put(rec);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getRecord(key) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function ensureObjectUrl(key) {
    await init();
    const e = entries.get(key);
    if (!e) return null;
    if (e.objectUrl) return e.objectUrl;
    const rec = await getRecord(key);
    if (!rec) {
      entries.delete(key);
      return null;
    }
    e.lastOpened = now();
    rec.lastOpened = e.lastOpened;
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    e.objectUrl = createObjectURLImpl(rec.blob);
    return e.objectUrl;
  }

  async function cacheFromUrl(key, url) {
    await init();
    if (entries.has(key)) {
      await touch(key);
      return ensureObjectUrl(key);
    }
    if (inFlight.has(key)) return inFlight.get(key);
    const p = (async () => {
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const rec = await put(key, blob, res.headers?.get?.('content-type') || undefined);
      const objectUrl = createObjectURLImpl(blob);
      const e = entries.get(key);
      if (e) e.objectUrl = objectUrl;
      void rec;
      for (const cb of listeners) cb(key, objectUrl);
      return objectUrl;
    })();
    inFlight.set(key, p);
    try {
      return await p;
    } finally {
      inFlight.delete(key);
    }
  }

  // Sync accessor: cached object URL if we have one, otherwise the remote URL.
  function srcFor(filePath, version, fallbackUrl) {
    const e = entries.get(keyFor(filePath, version));
    return e?.objectUrl || fallbackUrl;
  }

  // Async accessor: materializes the object URL from IDB on first hit.
  async function srcForAsync(filePath, version, fallbackUrl) {
    const key = keyFor(filePath, version);
    const url = await ensureObjectUrl(key);
    return url || fallbackUrl;
  }

  // Record that the user opened this media at this endpoint; kicks off a
  // background fetch+store when not cached yet (never bulk — one file only).
  async function noteOpened(filePath, version, url) {
    const key = keyFor(filePath, version);
    if (!entries.has(key)) {
      if (url) cacheFromUrl(key, url).catch(() => {});
      return;
    }
    await touch(key);
  }

  function onReady(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  async function clear() {
    const d = await db();
    for (const e of entries.values()) if (e.objectUrl) revokeObjectURLImpl(e.objectUrl);
    entries.clear();
    await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    init,
    keyFor,
    srcFor,
    srcForAsync,
    noteOpened,
    cacheFromUrl,
    put,
    touch,
    evictToBudget,
    totalBytes,
    clear,
    onReady,
    entries,
  };
}

let configured = null;
let singleton = null;

export function configureMediaCache(options) {
  configured = options;
  singleton = null;
}

export function getMediaCache() {
  if (!singleton) singleton = createMediaCache(configured || {});
  return singleton;
}
