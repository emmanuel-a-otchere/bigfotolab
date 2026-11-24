//! Headless bigfotolab-server binary.
//!
//! Usage: bigfotolab-server [--config-dir <dir>] [--port <n>] [--dist <dir>]
//!
//! - config-dir: holds app-config.json, per-library databases and server.json
//!   (auth token, generated on first run). Default: $BIGFOTOLAB_SERVER_DIR or
//!   the OS config dir + "bigfotolab-server".
//! - port: listen port (default 8080), bound on all interfaces for LAN access.
//! - dist: built frontend directory served at `/` (default: ../src-vite/dist).

use std::path::PathBuf;

#[tokio::main]
async fn main() {
    let mut config_dir: Option<PathBuf> = None;
    let mut port: u16 = 8080;
    let mut dist: Option<PathBuf> = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--config-dir" => config_dir = args.next().map(PathBuf::from),
            "--port" => port = args.next().and_then(|v| v.parse().ok()).unwrap_or(port),
            "--dist" => dist = args.next().map(PathBuf::from),
            "--help" | "-h" => {
                println!("bigfotolab-server [--config-dir <dir>] [--port <n>] [--dist <dir>]");
                return;
            }
            _ => {}
        }
    }
    let config_dir = config_dir.or_else(|| std::env::var_os("BIGFOTOLAB_SERVER_DIR").map(PathBuf::from)).unwrap_or_else(|| {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("bigfotolab-server")
    });
    let dist = dist.unwrap_or_else(|| PathBuf::from("../src-vite/dist"));

    if let Err(e) = bigfotolab::t_server::run(config_dir, port, dist).await {
        eprintln!("bigfotolab-server error: {}", e);
        std::process::exit(1);
    }
}
