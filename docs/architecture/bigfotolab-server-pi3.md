# bigfotolab-server on Raspberry Pi 3 — architecture & task plan

Status: plan (roadmap). Tracked under repo milestones "Phase 1"–"Phase 4" and the
`roadmap` / `server-backend` / `ux` labels; sync target: the additional project
space once linked.

## Problem

Running bigfotolab on a desktop whose library lives on network storage causes
massive network I/O: the client-side SQLite DB, per-file EXIF/XMP sidecar reads,
scanning (`WalkDir` in `t_sqlite.rs`), and per-thumbnail original decodes all
cross SMB/NFS per client.

## Target architecture

```
┌──────── LAN ────────┐      ┌─ Server co-located with storage (Raspberry Pi 3) ─┐
│ browser / PWA /     │ HTTP │  bigfotolab-server (headless Rust, reuses core)    │
│ Tauri webview  ─────┼─WS ──┼─► /api/v1/*       REST mirror of Tauri commands     │
│ (thin SPA, cached)  │      │  /events          WebSocket (replaces emit/listen) │
└─────────────────────┘      │  /media/thumb/{lib}/{id}?size=128..1024  pyramid   │
                             │  /media/original/{id}  Range + ETag + cache hdrs  │
                             │  SQLite DBs + thumb cache on server-local disk    │
                             └───────────────────────────────────────────────────┘
```

No import: the server opens library folders in place. Clients see opaque IDs and
API payloads only. All scan/sidecar/thumbnail work happens where the bytes are.

## Pi 3 constraints (design drivers)

- 4× Cortex-A53, 1 GB RAM (design to ≤2 GB ceiling), Ethernet 100 Mbps (3 B) /
  ~300 Mbps (3 B+, USB2-shared). Assume ~10–30 MB/s effective wire rate.
- OS: Raspberry Pi OS Lite 64-bit, read-only root + overlay, single systemd service.
- Rust binary cross-compiled (`aarch64-unknown-linux-gnu`), `opt-level="z"`, lto,
  strip, panic=abort. Tokio workers=2; thumbnail decode permits=1; SQLite WAL with
  ~8 MB cache, mmap off; max ~4 concurrent media streams.
- AI (ort CLIP/InsightFace) OFF on the Pi by default; RAW thumbnails via embedded
  previews (libraw only on explicit request). Optional AI runs on a separate node.

## Bandwidth-first serving (incremental resolution)

- Thumbnail pyramid `/media/thumb/{lib}/{id}?size=128|256|512|1024`, WebP/AVIF
  negotiation, progressive JPEG for the viewer; placeholder-first rendering:
  128 px paints <100 ms from HTTP cache, tiers upgrade as they arrive.
- Originals only on demand: `/media/original/{id}` with Range (video), ETag /
  `Cache-Control: immutable` on content-addressed thumbs.
- Video defaults to a small proxy transcode (360p/720p H.264) or HLS multi-bitrate;
  original via Range on request.
- One WebSocket for events + row-level delta sync (IDs + hashes, no polling);
  Brotli/gzip on API JSON; paginated/virtualized queries.

## UX requirement: drop-in, structure-mirroring, instant browsing

- Virtualized grid keyed by the folder tree exactly as indexed from disk
  (read-only; never rewrites paths). Opening an existing library just works.
- Fast scroll must feel almost instant on 100k+ libraries in local and remote mode.

## Phases / task plan

### Phase 1 (milestone 1) — transport split + headless skeleton
- [ ] `Transport` interface in `src-vite/src/common/api.js` (single choke point for
      all `invoke`/`listen`): `TauriTransport` (local) + `RemoteTransport`
      (HTTP + WS), chosen from config at startup.
- [ ] `src-tauri/src/bin/bigfotolab-server.rs` + `t_server.rs`: reuse command
      modules; read-only REST mirror; `/events` WS; per-request `library_id`
      (replaces global `CURRENT_LIBRARY_ID` guard in `t_cmds.rs:58`).
- [ ] Server config: libraries, DB dir on server disk (`t_storage.rs`), port,
      LAN-only bind, token. Desktop local mode unchanged.
- [ ] Acceptance: Pi 3 systemd service; browser lists libraries/albums/files.

### Phase 2 (milestone 2) — media pyramid + instant fast-scroll
- [ ] `/media/thumb/...` pyramid reusing `AThumb` queue (`t_protocol.rs`).
- [ ] `/media/original/...` generalizing `t_http.rs` (loopback → LAN + auth,
      Range, ETag, immutable cache).
- [ ] Pre-warm on scan; compression; UX grid per above. Bandwidth budget doc.
- [ ] Acceptance: 100k library scrolls instantly; wire bytes/page within budget.

### Phase 3 (milestone 3) — multi-user + delta sync + offline cache
- [ ] Per-user bearer tokens; library ACLs; optional TLS via reverse proxy;
      LAN-only/VPN.
- [ ] Per-user state rows (ratings, favorites, culling, collections, smart
      albums) over shared read-only index; WAL + single writer.
- [ ] WS delta sync + heartbeat/reconnect; client IndexedDB/SW offline cache;
      server-side sidecar watcher (XMP writeback stays server-side, `metadata/`).

### Phase 4 (milestone 4) — mobile staging
- [ ] PWA (manifest + service worker) served at `/`; Capacitor shell later.
- [ ] Adaptive video (proxy/HLS); optional off-Pi AI node.

## Future feature: reorganization templates

Automated re-organization of an existing library via strategy templates: built-in
presets + user-defined JSON/YAML templates + editor, dry-run diff preview,
execution through existing sidecar-preserving move/copy ops with undo. Browsing
remains read-only; reorganization is explicit, previewed, optional.

## Deliberate compatibility keeps

`lap:` XMP namespace (`src-tauri/src/metadata/schema.rs`), updater endpoint +
signing pubkey (`src-tauri/tauri.conf.json`), `julyx10/lap-binaries` assets.

## Phase 1 implementation notes (shipped in the server skeleton PR)

- The crate is now lib + two binaries: `src/lib.rs` (all core modules, `pub`),
  `src/main.rs` (thin desktop entry calling `bigfotolab::run()`), and
  `src/bin/bigfotolab-server.rs` (headless server).
- `src-tauri/src/t_server.rs` serves, with bearer-token auth (`server.json` in the
  config dir, generated on first run; token accepted as `Authorization: Bearer`
  or `?token=` for `<img>`/`<video>`/EventSource):
  - `POST /api/v1/cmd/{name}` — read-only whitelist mirror of Tauri commands
    (`get_app_config`, `get_library_info/state`, `get_all_albums`, `get_album`,
    `get_folder_files`, `get_query_files`, `get_file_info`, `get_files_by_ids`,
    `get_supported_format_extensions`, `list_collections`, `get_all_tags`,
    `get_taken_dates`, counts…), each run under a global DB lock with
    `library_id` set per request (`t_config::set_current_library_id`).
  - `GET /api/v1/events` — SSE stream (heartbeat + `thumbnail_ready` etc.),
    replaces `app.emit`/`listen` in remote mode.
  - `GET /media/thumb/{library}/{file_id}?size=` — thumbnail pyramid tier with
    ETag + `Cache-Control`, reusing `AThumb` cache/queue.
  - `GET /media/original/{path}` — original bytes with Range support.
  - `GET /*` — static SPA from `--dist` (default `../src-vite/dist`).
- Run: `bigfotolab-server --config-dir ~/.config/bigfotolab-server --port 8080 --dist ../src-vite/dist`
- Frontend: `src-vite/src/common/transport.js` exports `invoke`/`listen` with
  Tauri-compatible signatures; `api.js` now imports them from there (212 call
  sites unchanged). Remote mode is enabled via `settings.remoteServer`
  (`{enabled, url, token}`) and switches `thumb://`/`preview://`/media URLs to
  `{server}/media/...?token=...`.

## Phase 2 implementation notes

- `t_server.rs` now gzips API JSON and static SPA assets (flate2, `Accept-Encoding: gzip`,
  `Vary: Accept-Encoding`) — fetch/EventSource decompress transparently.
- New `POST /api/v1/cmd/prewarm_thumbs` `{albumId?, sizes?}` — background pyramid
  pre-warm (default tiers 128 + 512) through the existing `AThumb` queue with
  permits, emitting `prewarm_progress` / `prewarm_finished` over SSE.
- Thumb pyramid tiers via `GET /media/thumb/{lib}/{id}?size=64..2048` with ETag +
  `Cache-Control: public, max-age=3600`; originals stay `no-cache` + Range + ETag.
- Known deferral: server-side *scanning* (`index_album`) needs the AppHandle-based
  emitter in `t_utils::index_album_worker`; that refactor lands with Phase 3.
  Until then, index libraries with the desktop build against the same config dir.

## Phase 3 slice 1 — sessions (shipped)

- Server keeps a server-level `server.db` in the config dir with `sessions` and
  `applied_actions` tables. `POST /api/v1/session` (LAN token only, no user auth)
  creates an opaque session id; `GET /api/v1/session` returns the current one.
- Every request resolves a session from `X-Session-Id` / `?sid=`, defaulting to a
  lazily-created `default` session so Phase 1/2 clients keep working unchanged.
- Client (`transport.js`) obtains and persists the session id (localStorage) and
  attaches it to API calls (`X-Session-Id`), SSE (`?sid=`), and media URLs.
- Next slice: per-session state tables merged over the shared index.

## Phase 3 slice 2 — per-session state isolation (shipped)

- Library DBs get a `user_file_state(session_id, file_id, rating, is_favorite,
  culling_flag, updated_at)` table (NULL = no override). Base `afiles` stays shared.
- Read commands (`get_file_info`, `get_files_by_ids`, `get_query_files`,
  `get_folder_files`) merge the request's session overrides over the base rows
  (session wins), all under the existing per-request library lock.
- New `POST /api/v1/cmd/set_file_user_state {fileId, rating?, isFavorite?,
  cullingFlag?}` upserts only the session's row (NULL arg keeps previous) and
  broadcasts `file_updated` over SSE. Client setters (`setFileRating` /
  `setFileFavorite` / `setFileCullingFlag`) route to it in remote mode.

## Phase 3 slice 3 — offline outbox + sync-back (shipped)

- `POST /api/v1/cmd/apply_user_actions {actions:[{uuid,type,...}]}` — deduped via
  `applied_actions(session_id, action_uuid)` in server.db. Types:
  `state` → session override row + SSE `file_updated`;
  `sidecar` → afiles update + XMP sidecar writeback (`xmp::save_batch`) + SSE.
- `POST /api/v1/media/upload?path=&mode=replace|new&expected_sha256=&library_id=`
  — raw body streamed to a `.bflpart` temp file then renamed (never in RAM);
  replace verifies the expected source hash (409 on mismatch); new picks a
  unique name. Emits `file_updated`.
- Client `common/outbox.js`: small actions queued in localStorage, flushed as
  one batch; media actions keep the Blob in IndexedDB and upload via the upload
  endpoint; flush on `online` and at startup. api.js setters enqueue on network
  failure. Tests: `src-vite/tests/outbox.test.mjs` (`pnpm run test:outbox`).
- Client cache policy: only opened media is cached (HTTP cache/IDB, LRU-capped).
