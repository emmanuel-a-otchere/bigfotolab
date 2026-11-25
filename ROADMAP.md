# bigfotolab Roadmap

This is the living feature list and delivery plan for bigfotolab. It is maintained
together with the repository's GitHub tooling: each phase below maps to a
**milestone** in this repository, items are tracked with the `roadmap` label, and
the detailed plans live in [docs/architecture/](docs/architecture/). When the
additional project space is linked, this roadmap and its specs/features are synced
to both project spaces consistently.

## Shipped

- **Rename to bigfotolab** — the app is branded bigfotolab throughout (product name,
  bundle identifier `com.bigfotolab.app`, docs, locales, packaging). See PR #1.
  Compatibility note: the `lap:` XMP namespace, the updater signing key, and the
  `julyx10/lap-binaries` asset repo are intentionally unchanged.

## Guiding requirements

- **Drop-in for existing libraries.** bigfotolab opens an already-existing library
  in place: no import, no copy, no restructuring. Browsing reflects the on-disk
  directory structure as-is.
- **Instant fast scroll.** Scrolling a large library's thumbnails feels almost
  instant via a resolution pyramid (128/256/512/1024 px tiers, placeholder-first),
  virtualized grid, and aggressive caching — in both local and remote modes.
- **Co-located server (Pi 3).** A headless `bigfotolab-server` runs on a Raspberry
  Pi 3 (≤2 GB RAM, 100–300 Mbps LAN) next to the storage. It does all file I/O
  (scan, EXIF/XMP sidecars, thumbnail decode) locally and serves thin LAN clients
  (browser / PWA / Tauri webview) over HTTP + WebSocket. No media ever crosses the
  network per-file from clients; only optimized pyramid tiers, deltas, and
  on-demand Range originals do.

## Phases (milestones)

- **Milestone 1 — Phase 1: transport split + headless bigfotolab-server skeleton.**
  `Transport` abstraction in `src-vite/src/common/api.js` (`TauriTransport` /
  `RemoteTransport`); headless server binary reusing the Rust core; read-only REST
  API + `/events` WebSocket; per-request library context; DB on server-local disk;
  aarch64 cross-build tuned for Pi 3 (1 worker decode, capped SQLite cache, AI off).
- **Milestone 2 — Phase 2: media serving + instant fast-scroll.**
  `/media/thumb/{lib}/{id}?size=…` pyramid, `/media/original/{id}` with Range +
  ETag + immutable caching, pre-warm on scan, Brotli API compression, WS
  `thumbnail_ready`; UX issue: virtualized grid mirroring the folder tree.
- **Milestone 3 — Phase 3: sessions + isolated per-user state + opened-media cache + offline-edit sync.**
  No auth: opaque session ids (`POST /api/v1/session`) layer local-user identity
  on top of the LAN token gate; per-session state tables merged over the shared
  read-only index. Client caches only browsed metadata, displayed thumbs, and
  originals the user actually opened (size-capped LRU — never bulk media).
  Offline outbox syncs back: state changes, XMP sidecar edits, replace media
  (hash-checked), or save-as-new derivative, deduped by action UUID, with SSE
  invalidation to other sessions.
- **Milestone 4 — Phase 4: mobile staging.**
  PWA served from the server, adaptive video (low-bitrate proxy / HLS, Range for
  originals), optional off-Pi AI node.

## Future feature roadmap

- **#11 (in progress)** 360° panorama support — Insta360 `.insp`/`.insv` and DJI
  GPano files indexed as `pano_360` and viewable in a spherical WebGL viewer
  (photos and 360 videos).
- **Automated library reorganization via strategy templates** — built-in presets
  (date Y/M/D, event, camera/lens, RAW+JPEG pairing, duplicate consolidation) plus
  user-defined templates (JSON/YAML + editor), dry-run diff preview, execution via
  the existing sidecar-preserving move/copy operations with undo. Browsing stays
  read-only; reorganization is explicit and previewed.

## Detailed plans

- [bigfotolab-server on Raspberry Pi 3 — architecture & task plan](docs/architecture/bigfotolab-server-pi3.md)
