// Transport abstraction: Tauri IPC (local desktop mode) or HTTP+SSE (remote
// bigfotolab-server mode). Selected at startup from settings.remoteServer.
// Exports `invoke` / `listen` with the same signatures as the Tauri APIs, so
// call sites (and tests that inject a mock `invoke`) work unchanged in both modes.
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen as tauriListen } from '@tauri-apps/api/event';

let mode = 'tauri';
let serverUrl = '';
let serverToken = '';
let sessionId = null;
let eventSource = null;
const sseListeners = new Map();
// Delta sync / reconnect resync: provider returns the server sync state
// (set from main.js via setSyncStateProvider), lastSyncState is the last seen one.
let syncStateProvider = null;
let lastSyncState = null;

export function setSyncStateProvider(fn) {
  syncStateProvider = fn;
}

export function getLastSyncState() {
  return lastSyncState;
}

function emitLocal(event, payload) {
  const cbs = sseListeners.get(event);
  if (!cbs) return;
  for (const cb of cbs) {
    try {
      cb(payload);
    } catch { /* listener errors stay isolated */ }
  }
}

// Fetch the server sync state and broadcast it; on change, also re-broadcast
// files-changed / collections-changed so existing listeners refresh.
async function resyncAfterConnect() {
  if (!syncStateProvider) return;
  let state;
  try {
    state = await syncStateProvider();
  } catch {
    return;
  }
  if (!state) return;
  const prev = lastSyncState;
  lastSyncState = state;
  emitLocal('sync_state', state);
  if (prev && prev.files_version !== state.files_version) {
    emitLocal('files-changed', { filesVersion: state.files_version });
  }
  if (prev && prev.collections_version !== state.collections_version) {
    emitLocal('collections-changed', { sessionId: state.session_id });
  }
}

export function getSessionId() {
  return sessionId;
}

async function ensureSession() {
  if (sessionId) return sessionId;
  try {
    sessionId = localStorage.getItem('bigfotolab.sessionId') || null;
  } catch { /* storage unavailable */ }
  if (!sessionId && serverUrl) {
    const res = await fetch(`${serverUrl}/api/v1/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serverToken}` },
      body: '{}',
    });
    const data = await res.json().catch(() => ({}));
    if (data.session_id) {
      sessionId = data.session_id;
      try { localStorage.setItem('bigfotolab.sessionId', sessionId); } catch { /* ignore */ }
    }
  }
  return sessionId;
}

export function configureTransport({ mode: m = 'tauri', url = '', token = '' } = {}) {
  mode = m;
  serverUrl = (url || '').replace(/\/+$/, '');
  serverToken = token || '';
  if (mode === 'remote' && serverUrl && !eventSource) {
    ensureSession().then((sid) => {
      const q = `token=${encodeURIComponent(serverToken)}${sid ? `&sid=${encodeURIComponent(sid)}` : ''}`;
      eventSource = new EventSource(`${serverUrl}/api/v1/events?${q}`);
      // Every (re)connect resyncs the delta-sync state (EventSource auto-reconnects).
      eventSource.onopen = () => {
        void resyncAfterConnect();
      };
      for (const [event, cbs] of sseListeners) {
        for (const cb of cbs) attachSse(event, cb);
      }
    });
  }
}

function attachSse(event, cb) {
  if (!eventSource) return;
  eventSource.addEventListener(event, (e) => {
    try {
      cb(JSON.parse(e.data));
    } catch {
      cb(e.data);
    }
  });
}

export function isRemote() {
  return mode === 'remote';
}

export function getServerUrl() {
  return serverUrl;
}

export function getServerToken() {
  return serverToken;
}

export async function invoke(cmd, args) {
  if (mode !== 'remote') return tauriInvoke(cmd, args);
  const sid = await ensureSession();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${serverToken}` };
  if (sid) headers['X-Session-Id'] = sid;
  const res = await fetch(`${serverUrl}/api/v1/cmd/${cmd}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ args: args || {} }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data.result;
}

export function listen(event, callback) {
  if (mode !== 'remote') return tauriListen(event, callback);
  if (!sseListeners.has(event)) sseListeners.set(event, new Set());
  sseListeners.get(event).add(callback);
  attachSse(event, callback);
  return Promise.resolve(() => {
    sseListeners.get(event)?.delete(callback);
  });
}
