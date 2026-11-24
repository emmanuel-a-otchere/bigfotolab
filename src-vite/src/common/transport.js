// Transport abstraction: Tauri IPC (local desktop mode) or HTTP+SSE (remote
// bigfotolab-server mode). Selected at startup from settings.remoteServer.
// Exports `invoke` / `listen` with the same signatures as the Tauri APIs, so
// call sites (and tests that inject a mock `invoke`) work unchanged in both modes.
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen as tauriListen } from '@tauri-apps/api/event';

let mode = 'tauri';
let serverUrl = '';
let serverToken = '';
let eventSource = null;
const sseListeners = new Map();

export function configureTransport({ mode: m = 'tauri', url = '', token = '' } = {}) {
  mode = m;
  serverUrl = (url || '').replace(/\/+$/, '');
  serverToken = token || '';
  if (mode === 'remote' && serverUrl && !eventSource) {
    eventSource = new EventSource(`${serverUrl}/api/v1/events?token=${encodeURIComponent(serverToken)}`);
    for (const [event, cbs] of sseListeners) {
      for (const cb of cbs) attachSse(event, cb);
    }
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
  const res = await fetch(`${serverUrl}/api/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serverToken}` },
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
