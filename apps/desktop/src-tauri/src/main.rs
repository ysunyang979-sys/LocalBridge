// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemStatus {
    pub ready: bool,
    pub version: String,
    pub platform: String,
}

#[tauri::command]
fn get_desktop_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[tauri::command]
fn check_desktop_health() -> SystemStatus {
    SystemStatus {
        ready: true,
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_desktop_version,
            check_desktop_health
        ])
        .run(tauri::generate_context!())
        .expect("error while running LocalBridge Desktop application");
}
