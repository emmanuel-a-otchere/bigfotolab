// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

//! Desktop binary entry point; all logic lives in the library crate so the
//! headless `bigfotolab-server` binary can reuse it.

fn main() {
    bigfotolab::run();
}
