// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Default)]
struct SupervisorState {
    server_process: Option<Child>,
    runner_process: Option<Child>,
    bundled_node: Option<PathBuf>,
    server_entry: Option<PathBuf>,
    runner_entry: Option<PathBuf>,
    runner_token: Option<String>,
    data_dir: Option<PathBuf>,
}

impl SupervisorState {
    fn shutdown(&mut self) {
        if let Some(mut runner) = self.runner_process.take() {
            let _ = runner.kill();
        }
        if let Some(mut server) = self.server_process.take() {
            let _ = server.kill();
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemStatus {
    pub ready: bool,
    pub version: String,
    pub platform: String,
    pub bundled_runtime: bool,
    pub server_running: bool,
    pub runner_running: bool,
}

#[tauri::command]
fn get_desktop_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[tauri::command]
fn check_desktop_health(state: tauri::State<Arc<Mutex<SupervisorState>>>) -> SystemStatus {
    let (bundled, server_active, runner_active) = match state.lock() {
        Ok(s) => (
            s.bundled_node.is_some(),
            s.server_process.is_some() || is_port_open(18080),
            s.runner_process.is_some(),
        ),
        Err(_) => (false, false, false),
    };

    SystemStatus {
        ready: true,
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        bundled_runtime: bundled,
        server_running: server_active,
        runner_running: runner_active,
    }
}

fn is_port_open(port: u16) -> bool {
    TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_millis(200),
    )
    .is_ok()
}

fn resolve_resource_file(app: &tauri::AppHandle, relative_path: &str) -> Option<PathBuf> {
    // 1. Tauri resource directory
    if let Ok(res_dir) = app.path().resource_dir() {
        let p1 = res_dir.join(relative_path);
        if p1.exists() {
            return Some(p1);
        }
        let p2 = res_dir.join("resources").join(relative_path);
        if p2.exists() {
            return Some(p2);
        }
    }

    // 2. Directory containing current executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            let p1 = parent.join(relative_path);
            if p1.exists() {
                return Some(p1);
            }
            let p2 = parent.join("resources").join(relative_path);
            if p2.exists() {
                return Some(p2);
            }
        }
    }

    // 3. Fallback for development workspace
    let dev_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
    let dev_p = dev_root.join(relative_path);
    if dev_p.exists() {
        return Some(dev_p);
    }

    None
}

fn get_or_create_runner_token(node_exe: &Path, data_dir: &Path) -> String {
    let key_file = data_dir.join("runner-token.key");
    if key_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&key_file) {
            let trimmed = content.trim();
            if trimmed.starts_with("lbr_") && trimmed.len() >= 36 {
                return trimmed.to_string();
            }
        }
    }

    // Generate high-entropy 256-bit token using bundled node's CSPRNG
    let mut cmd = Command::new(node_exe);
    cmd.args(["-e", "console.log('lbr_' + require('crypto').randomBytes(32).toString('hex'))"]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    if let Ok(output) = cmd.output() {
        let generated = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if generated.starts_with("lbr_") {
            let _ = std::fs::write(&key_file, &generated);
            return generated;
        }
    }

    // Fallback pseudo-random token if node eval somehow fails
    let fallback = format!("lbr_{:016x}{:016x}{:016x}{:016x}",
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(12345),
        std::process::id(),
        0xfeedface_u64,
        0xdeadbeef_u64
    );
    let _ = std::fs::write(&key_file, &fallback);
    fallback
}

fn start_supervisor(app: &tauri::AppHandle, supervisor: Arc<Mutex<SupervisorState>>) {
    // 1. Locate bundled node.exe
    let node_path = match resolve_resource_file(app, "runtime/node.exe") {
        Some(p) => p,
        None => {
            eprintln!("[LocalBridge Supervisor] Bundled node.exe not found.");
            return;
        }
    };

    // 2. Locate server and runner index.js
    let server_entry = match resolve_resource_file(app, "server/index.js") {
        Some(p) => p,
        None => {
            eprintln!("[LocalBridge Supervisor] Bundled server/index.js not found.");
            return;
        }
    };

    let runner_entry = match resolve_resource_file(app, "runner/index.js") {
        Some(p) => p,
        None => {
            eprintln!("[LocalBridge Supervisor] Bundled runner/index.js not found.");
            return;
        }
    };

    // 3. Prepare data directories in local app data
    let base_data_dir = std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            std::env::var("APPDATA")
                .map(PathBuf::from)
                .unwrap_or_else(|_| std::env::temp_dir())
        })
        .join("LocalBridge");

    let server_data_dir = base_data_dir.join("server");
    let runner_data_dir = base_data_dir.join("runner");
    let data_dir = base_data_dir.join("data");

    let _ = std::fs::create_dir_all(&server_data_dir);
    let _ = std::fs::create_dir_all(&runner_data_dir);
    let _ = std::fs::create_dir_all(&data_dir);

    let db_path = server_data_dir.join("localbridge.db");
    let projects_path = runner_data_dir.join("projects.json");

    // 4. Retrieve or generate runner token
    let runner_token = get_or_create_runner_token(&node_path, &data_dir);

    // 5. Update state
    if let Ok(mut state) = supervisor.lock() {
        state.bundled_node = Some(node_path.clone());
        state.server_entry = Some(server_entry.clone());
        state.runner_entry = Some(runner_entry.clone());
        state.runner_token = Some(runner_token.clone());
        state.data_dir = Some(base_data_dir);
    }

    // 6. Start Server if port 18080 is not already responding
    let server_already_running = is_port_open(18080);
    if !server_already_running {
        let server_cwd = server_entry.parent().unwrap_or(&server_entry);
        let mut server_cmd = Command::new(&node_path);
        server_cmd.arg(&server_entry);
        server_cmd.current_dir(server_cwd);
        server_cmd.env("LOCALBRIDGE_SERVER_PORT", "18080");
        server_cmd.env("LOCALBRIDGE_SERVER_HOST", "127.0.0.1");
        server_cmd.env("LOCALBRIDGE_SERVER_DB_PATH", db_path.to_string_lossy().to_string());
        server_cmd.env("LOCALBRIDGE_BOOTSTRAP_RUNNER_TOKEN", &runner_token);

        #[cfg(target_os = "windows")]
        server_cmd.creation_flags(CREATE_NO_WINDOW);

        match server_cmd.spawn() {
            Ok(child) => {
                if let Ok(mut state) = supervisor.lock() {
                    state.server_process = Some(child);
                }
            }
            Err(e) => {
                eprintln!("[LocalBridge Supervisor] Failed to spawn Server: {}", e);
            }
        }

        // Wait up to 10 seconds for Server port to open
        let mut ready = false;
        for _ in 0..50 {
            if is_port_open(18080) {
                ready = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(200));
        }

        if !ready {
            eprintln!("[LocalBridge Supervisor] Warning: Server did not respond within timeout.");
        }
    }

    // 7. Start Runner
    let runner_cwd = runner_entry.parent().unwrap_or(&runner_entry);
    let mut runner_cmd = Command::new(&node_path);
    runner_cmd.arg(&runner_entry);
    runner_cmd.current_dir(runner_cwd);
    runner_cmd.env("LOCALBRIDGE_SERVER_URL", "ws://127.0.0.1:18080/runner/ws");
    runner_cmd.env("LOCALBRIDGE_RUNNER_TOKEN", &runner_token);
    runner_cmd.env("LOCALBRIDGE_PROJECTS_PATH", projects_path.to_string_lossy().to_string());

    #[cfg(target_os = "windows")]
    runner_cmd.creation_flags(CREATE_NO_WINDOW);

    match runner_cmd.spawn() {
        Ok(child) => {
            if let Ok(mut state) = supervisor.lock() {
                state.runner_process = Some(child);
            }
        }
        Err(e) => {
            eprintln!("[LocalBridge Supervisor] Failed to spawn Runner: {}", e);
        }
    }
}

fn main() {
    let supervisor = Arc::new(Mutex::new(SupervisorState::default()));
    let supervisor_exit_clone = supervisor.clone();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(supervisor.clone())
        .invoke_handler(tauri::generate_handler![
            get_desktop_version,
            check_desktop_health
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let sup = supervisor.clone();
            std::thread::spawn(move || {
                start_supervisor(&app_handle, sup);
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running LocalBridge Desktop application");

    app.run(move |_app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
            if let Ok(mut state) = supervisor_exit_clone.lock() {
                state.shutdown();
            }
        }
    });
}
