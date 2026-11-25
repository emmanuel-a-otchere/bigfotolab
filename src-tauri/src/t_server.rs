//! Headless bigfotolab-server: LAN HTTP API + SSE events + media + static SPA.
//! Phase 1 skeleton: read-only command mirror, thumbnails, Range originals,
//! bearer-token auth. Reuses the desktop core modules unchanged.

use std::io;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use flate2::{write::GzEncoder, Compression};
use serde::Serialize;
use serde_json::{json, Value};
use std::io::Write as IoWrite;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, Mutex};

use crate::{t_cmds, t_config, t_http, t_protocol, t_sqlite};

static DB_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static EVENTS: OnceLock<broadcast::Sender<(String, String)>> = OnceLock::new();
static STATE: OnceLock<ServerState> = OnceLock::new();

struct ServerState {
    token: String,
    dist_dir: PathBuf,
    config_dir: PathBuf,
}

fn db_lock() -> &'static Mutex<()> {
    DB_LOCK.get_or_init(|| Mutex::new(()))
}

fn events() -> &'static broadcast::Sender<(String, String)> {
    EVENTS.get_or_init(|| broadcast::channel(256).0)
}

fn state() -> &'static ServerState {
    STATE.get().expect("server state not initialized")
}

/// Broadcast an event to all connected SSE clients (replaces tauri::emit in server mode).
pub fn emit_server_event(name: &str, payload: Value) {
    let _ = events().send((name.to_string(), payload.to_string()));
}

/// Start the headless server. `config_dir` holds app-config.json, library DBs and
/// server.json (auth token); `dist_dir` is the built frontend to serve at `/`.
pub async fn run(config_dir: PathBuf, port: u16, dist_dir: PathBuf) -> io::Result<()> {
    t_config::set_app_identifier("com.bigfotolab.app");
    t_config::init_server_config_dir(config_dir.clone());

    std::fs::create_dir_all(&config_dir)?;
    let token = load_or_create_token(&config_dir)?;
    let _ = t_config::load_app_config();
    t_sqlite::create_db().map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;

    ensure_server_db(&config_dir)?;
    let _ = STATE.set(ServerState { token, dist_dir, config_dir });

    let listener = TcpListener::bind(("0.0.0.0", port)).await?;
    eprintln!(
        "bigfotolab-server listening on 0.0.0.0:{} (config dir: {})",
        port,
        config_dir.display()
    );
    loop {
        let (stream, _peer) = listener.accept().await?;
        tokio::spawn(async move {
            let _ = handle_conn(stream).await;
        });
    }
}

/// Server-level SQLite (sessions, applied offline actions) in the config dir.
fn server_db_path() -> PathBuf {
    state().config_dir.join("server.db")
}

fn ensure_server_db(config_dir: &Path) -> io::Result<()> {
    let conn = rusqlite::Connection::open(config_dir.join("server.db"))
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sessions (
             id TEXT PRIMARY KEY,
             label TEXT NOT NULL DEFAULT '',
             created INTEGER NOT NULL,
             last_seen INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS applied_actions (
             session_id TEXT NOT NULL,
             action_uuid TEXT NOT NULL,
             applied_at INTEGER NOT NULL,
             PRIMARY KEY (session_id, action_uuid)
         );",
    )
    .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    Ok(())
}

/// Create a new session (no auth — trusted LAN) and return its id.
fn create_session(label: &str) -> io::Result<String> {
    let conn = rusqlite::Connection::open(server_db_path())
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    let id = uuid::Uuid::new_v4().simple().to_string();
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT INTO sessions (id, label, created, last_seen) VALUES (?1, ?2, ?3, ?3)",
        rusqlite::params![id, label, now],
    )
    .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    Ok(id)
}

/// Resolve the session for a request: X-Session-Id header or ?sid=, falling back
/// to a lazily-created "default" session so Phase 1 clients keep working.
fn resolve_session(req: &Request) -> String {
    let sid = req
        .header("x-session-id")
        .map(|s| s.to_string())
        .or_else(|| req.query_param("sid"))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "default".to_string());
    if let Ok(conn) = rusqlite::Connection::open(server_db_path()) {
        let now = chrono::Utc::now().timestamp();
        let _ = conn.execute(
            "INSERT OR IGNORE INTO sessions (id, label, created, last_seen) VALUES (?1, '', ?2, ?2)",
            rusqlite::params![sid, now],
        );
        let _ = conn.execute(
            "UPDATE sessions SET last_seen = ?2 WHERE id = ?1",
            rusqlite::params![sid, now],
        );
    }
    sid
}

fn load_or_create_token(config_dir: &Path) -> io::Result<String> {
    let path = config_dir.join("server.json");
    if let Ok(text) = std::fs::read_to_string(&path) {
        if let Ok(v) = serde_json::from_str::<Value>(&text) {
            if let Some(t) = v.get("token").and_then(|t| t.as_str()) {
                return Ok(t.to_string());
            }
        }
    }
    let token = uuid::Uuid::new_v4().simple().to_string();
    let text = serde_json::to_string_pretty(&json!({ "token": token }))?;
    std::fs::write(&path, text)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
    }
    eprintln!("generated new server token in {}", path.display());
    Ok(token)
}

struct Request {
    method: String,
    target: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

impl Request {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
    fn query(&self) -> &str {
        self.target.split_once('?').map(|(_, q)| q).unwrap_or("")
    }
    fn query_param(&self, key: &str) -> Option<String> {
        for pair in self.query().split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                if k == key {
                    return Some(v.to_string());
                }
            }
        }
        None
    }
    fn path(&self) -> &str {
        self.target.split('?').next().unwrap_or("")
    }
    fn authorized(&self) -> bool {
        if let Some(h) = self.header("authorization") {
            if let Some(bearer) = h.strip_prefix("Bearer ") {
                return bearer == state().token;
            }
        }
        self.query_param("token").as_deref() == Some(state().token.as_str())
    }
}

async fn read_request(stream: &mut TcpStream) -> io::Result<Option<Request>> {
    let mut buf = Vec::with_capacity(4096);
    let mut chunk = [0u8; 4096];
    let head_end = loop {
        if let Some(pos) = find_subsequence(&buf, b"\r\n\r\n") {
            break pos;
        }
        if buf.len() > 64 * 1024 {
            return Ok(None);
        }
        let n = stream.read(&mut chunk).await?;
        if n == 0 {
            return Ok(None);
        }
        buf.extend_from_slice(&chunk[..n]);
    };
    let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
    let content_length: usize = head
        .lines()
        .skip(1)
        .find_map(|l| {
            let (k, v) = l.split_once(':')?;
            k.eq_ignore_ascii_case("content-length")
                .then(|| v.trim().parse().ok())
                .flatten()
        })
        .unwrap_or(0);
    if content_length > 16 * 1024 * 1024 {
        return Ok(None);
    }
    let mut body = buf.split_off(head_end + 4);
    while body.len() < content_length {
        let n = stream.read(&mut chunk).await?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..n]);
    }
    body.truncate(content_length);
    let mut lines = head.lines();
    let mut parts = lines.next().unwrap_or_default().split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let target = parts.next().unwrap_or_default().to_string();
    let headers = lines
        .filter_map(|l| l.split_once(':').map(|(k, v)| (k.trim().to_string(), v.trim().to_string())))
        .collect();
    Ok(Some(Request { method, target, headers, body }))
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

fn accepts_gzip(req: &Request) -> bool {
    req.header("accept-encoding")
        .map(|h| h.to_ascii_lowercase().contains("gzip"))
        .unwrap_or(false)
}

fn gzip_body(data: &[u8]) -> Vec<u8> {
    let mut enc = GzEncoder::new(Vec::new(), Compression::fast());
    if enc.write_all(data).is_ok() {
        if let Ok(v) = enc.finish() {
            return v;
        }
    }
    data.to_vec()
}

async fn write_response(
    stream: &mut TcpStream,
    status: &str,
    headers: &[(String, String)],
    body: &[u8],
) -> io::Result<()> {
    let mut head = format!("HTTP/1.1 {}\r\nContent-Length: {}\r\n", status, body.len());
    for (k, v) in headers {
        head.push_str(&format!("{}: {}\r\n", k, v));
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes()).await?;
    stream.write_all(body).await?;
    stream.flush().await
}

async fn reject(stream: &mut TcpStream, status: &str) -> io::Result<()> {
    write_response(stream, status, &[("Content-Length".into(), "0".into())], &[]).await
}

async fn json_response(stream: &mut TcpStream, status: &str, value: &Value, gzip_ok: bool) -> io::Result<()> {
    let mut body = serde_json::to_vec(value).unwrap_or_default();
    let mut headers = vec![
        ("Content-Type".into(), "application/json".into()),
        ("Access-Control-Allow-Origin".into(), "*".into()),
    ];
    if gzip_ok && body.len() > 512 {
        body = gzip_body(&body);
        headers.push(("Content-Encoding".into(), "gzip".into()));
        headers.push(("Vary".into(), "Accept-Encoding".into()));
    }
    write_response(stream, status, &headers, &body).await
}

async fn handle_conn(mut stream: TcpStream) -> io::Result<()> {
    let Some(req) = read_request(&mut stream).await? else {
        return Ok(());
    };
    let path = req.path().to_string();
    let session = resolve_session(&req);
    if path == "/api/v1/session" {
        return handle_session(&mut stream, &req, &session).await;
    }
    if let Some(name) = path.strip_prefix("/api/v1/cmd/") {
        return handle_cmd(&mut stream, &req, name, &session).await;
    }
    match path.as_str() {
        "/api/v1/ping" => {
            if !req.authorized() {
                return reject(&mut stream, "401 Unauthorized").await;
            }
            return json_response(&mut stream, "200 OK", &json!({ "ok": true, "app": "bigfotolab-server", "version": env!("CARGO_PKG_VERSION") }), accepts_gzip(&req)).await;
        }
        "/api/v1/events" => return handle_events(&mut stream, &req).await,
        _ => {}
    }
    if let Some(rest) = path.strip_prefix("/media/thumb/") {
        return handle_thumb(&mut stream, &req, rest).await;
    }
    if let Some(rest) = path.strip_prefix("/media/original/") {
        return handle_original(&mut stream, &req, rest).await;
    }
    if req.method == "GET" || req.method == "HEAD" {
        return handle_static(&mut stream, &req, &path).await;
    }
    reject(&mut stream, "404 Not Found").await
}

fn camel_to_snake(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 4);
    for (i, c) in s.chars().enumerate() {
        if c.is_ascii_uppercase() {
            if i > 0 {
                out.push('_');
            }
            out.push(c.to_ascii_lowercase());
        } else {
            out.push(c);
        }
    }
    out
}

fn arg<T: serde::de::DeserializeOwned>(args: &Value, camel: &str) -> Result<T, String> {
    let snake = camel_to_snake(camel);
    args.get(&snake)
        .or_else(|| args.get(camel))
        .cloned()
        .ok_or_else(|| format!("missing argument '{}'", camel))?
        .pipe(serde_json::from_value)
        .map_err(|e| format!("invalid argument '{}': {}", camel, e))
}

fn opt_arg<T: serde::de::DeserializeOwned>(args: &Value, camel: &str) -> Result<Option<T>, String> {
    let snake = camel_to_snake(camel);
    match args.get(&snake).or_else(|| args.get(camel)) {
        None | Some(Value::Null) => Ok(None),
        Some(v) => serde_json::from_value(v.clone())
            .map(Some)
            .map_err(|e| format!("invalid argument '{}': {}", camel, e)),
    }
}

trait Pipe: Sized {
    fn pipe<R>(self, f: impl FnOnce(Self) -> R) -> R {
        f(self)
    }
}
impl<T> Pipe for T {}

async fn with_library<T, F, Fut>(library_id: Option<String>, f: F) -> Result<T, String>
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Result<T, String>>,
{
    let _guard = db_lock().lock().await;
    let id = match library_id {
        Some(id) if !id.is_empty() => id,
        _ => t_config::current_library_id()?,
    };
    t_config::set_current_library_id(&id)?;
    f().await
}

/// Session management (no auth by design — trusted LAN): POST creates a new
/// session, GET returns the current one.
async fn handle_session(stream: &mut TcpStream, req: &Request, current: &str) -> io::Result<()> {
    if !req.authorized() {
        return reject(stream, "401 Unauthorized").await;
    }
    if req.method == "POST" {
        let body: Value = serde_json::from_slice(&req.body).unwrap_or_else(|_| json!({}));
        let label = body.get("label").and_then(|v| v.as_str()).unwrap_or("").to_string();
        return match create_session(&label) {
            Ok(id) => json_response(stream, "200 OK", &json!({ "session_id": id, "label": label }), accepts_gzip(req)).await,
            Err(e) => json_response(stream, "500 Internal Server Error", &json!({ "error": e.to_string() }), false).await,
        };
    }
    let info = rusqlite::Connection::open(server_db_path())
        .ok()
        .and_then(|conn| {
            conn.query_row(
                "SELECT id, label, created, last_seen FROM sessions WHERE id = ?1",
                rusqlite::params![current],
                |r| {
                    Ok(json!({
                        "session_id": r.get::<_, String>(0)?,
                        "label": r.get::<_, String>(1)?,
                        "created": r.get::<_, i64>(2)?,
                        "last_seen": r.get::<_, i64>(3)?,
                    }))
                },
            )
            .ok()
        })
        .unwrap_or_else(|| json!({ "session_id": current }));
    json_response(stream, "200 OK", &info, accepts_gzip(req)).await
}

async fn handle_cmd(stream: &mut TcpStream, req: &Request, name: &str, session: &str) -> io::Result<()> {
    if req.method != "POST" {
        return reject(stream, "405 Method Not Allowed").await;
    }
    if !req.authorized() {
        return reject(stream, "401 Unauthorized").await;
    }
    let _ = session; // session-scoped state lands in the next slice
    let body: Value = match serde_json::from_slice(&req.body) {
        Ok(v) => v,
        Err(e) => return json_response(stream, "400 Bad Request", &json!({ "error": format!("invalid JSON body: {}", e) }), accepts_gzip(req)).await,
    };
    let args = body.get("args").cloned().unwrap_or_else(|| json!({}));
    let library_id = body.get("library_id").and_then(|v| v.as_str()).map(|s| s.to_string());

    if name == "prewarm_thumbs" {
        return handle_prewarm(stream, req, &args, library_id).await;
    }

    let result: Result<Value, String> = match name {
        "get_app_config" => with_library(library_id, || async { t_cmds::get_app_config().map(|v| serde_json::to_value(v).unwrap()) }).await,
        "get_library_info" => with_library(library_id, || async { let id: String = arg(&args, "id")?; t_cmds::get_library_info(id).await.map(|v| serde_json::to_value(v).unwrap()) }).await,
        "get_library_state" => with_library(library_id, || async { let id: String = arg(&args, "id")?; t_cmds::get_library_state(&id).map(|v| serde_json::to_value(v).unwrap()) }).await,
        "get_current_library_state" => with_library(library_id, || async { t_cmds::get_current_library_state().map(|v| serde_json::to_value(v).unwrap()) }).await,
        "get_all_albums" => with_library(library_id, || async { let r: bool = arg(&args, "refreshAccessibility").unwrap_or(false); t_cmds::get_all_albums(r).map(|v| serde_json::to_value(v).unwrap()) }).await,
        "get_all_album_folders" => with_library(library_id, || async { let inc: Option<bool> = opt_arg(&args, "includeExcluded")?; t_cmds::get_all_album_folders(inc).map(|v| serde_json::to_value(v).unwrap()) }).await,
        "get_album" => with_library(library_id, || async { let id: i64 = arg(&args, "albumId")?; t_cmds::get_album(id).map(|v| serde_json::to_value(v).unwrap()) }).await,
        "get_album_visible_counts" => with_library(library_id, || async { t_cmds::get_album_visible_counts().map(|v| serde_json::to_value(v).unwrap()) }).await,
        "get_library_visible_counts" => with_library(library_id, || async { let id: Option<String> = opt_arg(&args, "id")?; t_cmds::get_library_visible_counts(id).await.map(|v| serde_json::to_value(v).unwrap()) }).await,
        "get_folder_files" => with_library(library_id, || async {
            let file_type: i64 = arg(&args, "fileType")?;
            let sort_type: i64 = arg(&args, "sortType")?;
            let sort_order: i64 = arg(&args, "sortOrder")?;
            let folder_id: i64 = arg(&args, "folderId")?;
            let folder_path: String = arg(&args, "folderPath")?;
            let from_db_only: Option<bool> = opt_arg(&args, "fromDbOnly")?;
            let (files, w, h) = t_cmds::get_folder_files(file_type, sort_type, sort_order, folder_id, &folder_path, from_db_only);
            Ok(json!({ "files": files, "width": w, "height": h }))
        }).await,
        "get_query_files" => with_library(library_id, || async {
            let params: t_sqlite::QueryParams = arg(&args, "params")?;
            let offset: i64 = arg(&args, "offset")?;
            let limit: i64 = arg(&args, "limit")?;
            t_cmds::get_query_files(params, offset, limit).await.map(|v| serde_json::to_value(v).unwrap())
        }).await,
        "get_file_info" => with_library(library_id, || async { let id: i64 = arg(&args, "fileId")?; t_cmds::get_file_info(id).map(|v| serde_json::to_value(v).unwrap()) }).await,
        "get_files_by_ids" => with_library(library_id, || async { let ids: Vec<i64> = arg(&args, "fileIds")?; t_cmds::get_files_by_ids(ids).await.map(|v| serde_json::to_value(v).unwrap()) }).await,
        "get_supported_format_extensions" => with_library(library_id, || async { Ok(serde_json::to_value(t_cmds::get_supported_format_extensions()).unwrap()) }).await,
        "list_collections" => with_library(library_id, || async { t_cmds::list_collections().map(|v| serde_json::to_value(v).unwrap()) }).await,
        "get_all_tags" => with_library(library_id, || async { let sort: i64 = arg(&args, "sort").unwrap_or(0); t_cmds::get_all_tags(sort).map(|v| serde_json::to_value(v).unwrap()) }).await,
        "get_taken_dates" => with_library(library_id, || async { let sort: i64 = arg(&args, "sort").unwrap_or(0); t_cmds::get_taken_dates(sort).map(|v| serde_json::to_value(v).unwrap()) }).await,
        _ => Err(format!("command '{}' is not available in server mode", name)),
    };

    match result {
        Ok(v) => json_response(stream, "200 OK", &json!({ "result": v }), accepts_gzip(req)).await,
        Err(e) => json_response(stream, "400 Bad Request", &json!({ "error": e }), false).await,
    }
}

/// Background thumbnail pre-warm for a whole library (or one album), emitting
/// prewarm_progress / prewarm_finished over SSE. Sizes default to the low and
/// grid tiers of the pyramid (128, 512).
async fn handle_prewarm(
    stream: &mut TcpStream,
    req: &Request,
    args: &Value,
    library_id: Option<String>,
) -> io::Result<()> {
    let album_id: Option<i64> = match opt_arg(args, "albumId") {
        Ok(v) => v,
        Err(e) => return json_response(stream, "400 Bad Request", &json!({ "error": e }), false).await,
    };
    let sizes: Vec<u32> = match opt_arg(args, "sizes") {
        Ok(v) => v.unwrap_or_else(|| vec![128, 512]),
        Err(e) => return json_response(stream, "400 Bad Request", &json!({ "error": e }), false).await,
    }
        .into_iter()
        .map(|s| s.clamp(64, 2048))
        .collect();
    let count: Result<i64, String> = with_library(library_id.clone(), || async move {
        let conn = t_sqlite::open_conn()?;
        let mut stmt = conn
            .prepare("SELECT COUNT(*) FROM afiles WHERE file_type IN (1,2,3) AND (?1 IS NULL OR album_id = ?1)")
            .map_err(|e| e.to_string())?;
        let n: i64 = stmt
            .query_row(rusqlite::params![album_id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        Ok(n)
    })
    .await;
    let count = match count {
        Ok(n) => n,
        Err(e) => return json_response(stream, "400 Bad Request", &json!({ "error": e }), false).await,
    };

    tokio::spawn(async move {
        let _guard = db_lock().lock().await;
        if let Some(id) = &library_id {
            let _ = t_config::set_current_library_id(id);
        }
        let ids: Vec<i64> = match t_sqlite::open_conn().and_then(|conn| {
            let mut stmt = conn
                .prepare("SELECT id FROM afiles WHERE file_type IN (1,2,3) AND (?1 IS NULL OR album_id = ?1) ORDER BY id")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(rusqlite::params![album_id], |r| r.get(0))
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<i64>, _>>().map_err(|e| e.to_string())
        }) {
            Ok(ids) => ids,
            Err(e) => {
                emit_server_event("prewarm_finished", json!({ "error": e }));
                return;
            }
        };
        let total = ids.len() as u64 * sizes.len() as u64;
        let mut done = 0u64;
        for size in sizes {
            let options = t_protocol::raw_display_options(None);
            for id in &ids {
                let id = *id;
                let file = match t_sqlite::AFile::get_file_info(id) {
                    Ok(Some(f)) => f,
                    _ => continue,
                };
                let path = file.file_path.clone().unwrap_or_default();
                let permit = match t_sqlite::thumb_background_generation_permits().acquire_owned().await {
                    Ok(p) => p,
                    Err(_) => break,
                };
                let _ = tokio::task::spawn_blocking(move || {
                    let _permit = permit;
                    t_sqlite::AThumb::get_or_create_thumb(
                        id,
                        &path,
                        file.file_type.unwrap_or(0),
                        file.e_orientation.unwrap_or(1) as i32,
                        size,
                        options,
                        false,
                        file.duration.map(|d| d as u64),
                        None,
                        false,
                    )
                })
                .await;
                done += 1;
                if done % 25 == 0 || done == total {
                    emit_server_event("prewarm_progress", json!({ "done": done, "total": total, "size": size }));
                }
            }
        }
        emit_server_event("prewarm_finished", json!({ "done": done, "total": total }));
    });

    json_response(
        stream,
        "200 OK",
        &json!({ "result": { "started": true, "files": count } }),
        accepts_gzip(req),
    )
    .await
}

async fn handle_events(stream: &mut TcpStream, req: &Request) -> io::Result<()> {
    if !req.authorized() {
        return reject(stream, "401 Unauthorized").await;
    }
    let head = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\nAccess-Control-Allow-Origin: *\r\n\r\nretry: 3000\n\n";
    stream.write_all(head.as_bytes()).await?;
    let mut rx = events().subscribe();
    loop {
        tokio::select! {
            recv = rx.recv() => {
                match recv {
                    Ok((name, data)) => {
                        let msg = format!("event: {}\ndata: {}\n\n", name, data);
                        if stream.write_all(msg.as_bytes()).await.is_err() {
                            return Ok(());
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => return Ok(()),
                }
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(15)) => {
                if stream.write_all(b": ping\n\n").await.is_err() {
                    return Ok(());
                }
            }
        }
    }
}

async fn handle_thumb(stream: &mut TcpStream, req: &Request, rest: &str) -> io::Result<()> {
    if !req.authorized() {
        return reject(stream, "401 Unauthorized").await;
    }
    let mut segments = rest.splitn(2, '/');
    let library_id = segments.next().unwrap_or("default").to_string();
    let file_id: i64 = segments
        .next()
        .and_then(|s| s.split('?').next().unwrap_or(s).parse().ok())
        .unwrap_or(0);
    if file_id <= 0 {
        return reject(stream, "400 Bad Request").await;
    }
    let size = req
        .query_param("size")
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(512)
        .clamp(64, 2048);
    let options = t_protocol::raw_display_options(Some(req.query()));

    let result = with_library(Some(library_id.clone()), || async move {
        let file = t_sqlite::AFile::get_file_info(file_id)?
            .ok_or_else(|| "file not found".to_string())?;
        let path = file.file_path.clone().unwrap_or_default();
        if let Some(thumb) = t_sqlite::AThumb::get_thumb_if_available(file_id, &path, false, file.album_accessible)? {
            if let Some(data) = thumb.thumb_data {
                return Ok((data, file.file_type == Some(3)));
            }
        }
        let permit = t_sqlite::thumb_background_generation_permits().acquire_owned().await.map_err(|e| e.to_string())?;
        let thumb = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            t_sqlite::AThumb::get_or_create_thumb(
                file_id,
                &path,
                file.file_type.unwrap_or(0),
                file.e_orientation.unwrap_or(1) as i32,
                size,
                options,
                false,
                file.duration.map(|d| d as u64),
                None,
                false,
            )
        })
        .await
        .map_err(|e| e.to_string())??;
        if let Some(thumb) = thumb {
            if let Some(data) = thumb.thumb_data {
                emit_server_event("thumbnail_ready", json!({ "library_id": library_id, "file_ids": [file_id] }));
                return Ok((data, false));
            }
        }
        Err("thumbnail unavailable".to_string())
    })
    .await;

    match result {
        Ok((data, _raw)) => {
            let etag = blake3::hash(&data).to_hex()[..16].to_string();
            let mime = t_protocol::detect_image_mime(&data);
            write_response(
                stream,
                "200 OK",
                &[
                    ("Content-Type".into(), mime.into()),
                    ("Content-Length".into(), data.len().to_string()),
                    ("ETag".into(), format!("\"{}\"", etag)),
                    ("Cache-Control".into(), "public, max-age=3600".into()),
                    ("Access-Control-Allow-Origin".into(), "*".into()),
                ],
                &data,
            )
            .await
        }
        Err(e) => json_response(stream, "404 Not Found", &json!({ "error": e }), false).await,
    }
}

fn ext_mime(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "webp" => "image/webp",
        "webmanifest" => "application/manifest+json",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "mp4" | "m4v" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "heic" => "image/heic",
        "avif" => "image/avif",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

async fn handle_original(stream: &mut TcpStream, req: &Request, rest: &str) -> io::Result<()> {
    if !req.authorized() {
        return reject(stream, "401 Unauthorized").await;
    }
    let encoded = rest.split('?').next().unwrap_or(rest);
    let Ok(decoded) = percent_encoding::percent_decode_str(encoded).decode_utf8() else {
        return reject(stream, "400 Bad Request").await;
    };
    let path = PathBuf::from(decoded.as_ref());
    if !path.is_absolute() {
        return reject(stream, "403 Forbidden").await;
    }
    let meta = match tokio::fs::metadata(&path).await {
        Ok(m) if m.is_file() => m,
        _ => return reject(stream, "404 Not Found").await,
    };
    let size = meta.len();
    let etag = format!("\"{}-{:?}\"", size, meta.modified().ok());
    let mut file = tokio::fs::File::open(&path).await?;
    let range = req.header("range").and_then(|h| t_http::parse_http_range(h, size));
    let (status, start, len) = match range {
        Some((s, e)) => ("206 Partial Content", s, e - s + 1),
        None => ("200 OK", 0, size),
    };
    let mut headers = vec![
        ("Content-Type".to_string(), ext_mime(&path).to_string()),
        ("Accept-Ranges".to_string(), "bytes".to_string()),
        ("ETag".to_string(), etag),
        ("Cache-Control".to_string(), "no-cache".to_string()),
        ("Access-Control-Allow-Origin".to_string(), "*".to_string()),
    ];
    if let Some((s, e)) = range {
        headers.push(("Content-Range".to_string(), format!("bytes {}-{}/{}", s, e, size)));
    }
    headers.push(("Content-Length".to_string(), len.to_string()));
    let mut head = format!("HTTP/1.1 {}\r\n", status);
    for (k, v) in &headers {
        head.push_str(&format!("{}: {}\r\n", k, v));
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes()).await?;
    if req.method == "HEAD" {
        return stream.flush().await;
    }
    file.seek(std::io::SeekFrom::Start(start)).await?;
    let mut limited = file.take(len);
    tokio::io::copy(&mut limited, &mut *stream).await?;
    stream.flush().await
}

async fn handle_static(stream: &mut TcpStream, req: &Request, path: &str) -> io::Result<()> {
    let rel = path.trim_start_matches('/');
    let rel = if rel.is_empty() { "index.html" } else { rel };
    let candidate = state().dist_dir.join(rel);
    let safe = candidate
        .canonicalize()
        .ok()
        .filter(|p| p.starts_with(&state().dist_dir))
        .unwrap_or_else(|| state().dist_dir.join("index.html"));
    let safe = if safe.is_dir() { safe.join("index.html") } else { safe };
    let Ok(data) = tokio::fs::read(&safe).await else {
        return reject(stream, "404 Not Found").await;
    };
    let compressible = matches!(ext_mime(&safe), "text/javascript; charset=utf-8" | "text/css; charset=utf-8" | "text/html; charset=utf-8" | "application/json" | "image/svg+xml");
    let mut headers = vec![
        ("Content-Type".into(), ext_mime(&safe).into()),
        ("Cache-Control".into(), "no-cache".into()),
    ];
    let mut body: Vec<u8> = if req.method == "HEAD" { Vec::new() } else { data };
    if compressible && accepts_gzip(req) && body.len() > 512 {
        body = gzip_body(&body);
        headers.push(("Content-Encoding".into(), "gzip".into()));
        headers.push(("Vary".into(), "Accept-Encoding".into()));
    }
    write_response(stream, "200 OK", &headers, &body).await
}

#[allow(dead_code)]
fn _assert_serialize<T: Serialize>() {}
