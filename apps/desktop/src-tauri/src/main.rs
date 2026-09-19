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
    management_token: Option<String>,
    server_port: u16,
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

fn get_or_create_management_token(node_exe: &Path, data_dir: &Path) -> String {
    let key_file = data_dir.join("management-token.key");
    if key_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&key_file) {
            let trimmed = content.trim();
            if trimmed.starts_with("lm_") && trimmed.len() >= 36 {
                return trimmed.to_string();
            }
        }
    }

    // Generate high-entropy 256-bit token using bundled node's CSPRNG
    let mut cmd = Command::new(node_exe);
    cmd.args(["-e", "console.log('lm_' + require('crypto').randomBytes(32).toString('hex'))"]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    if let Ok(output) = cmd.output() {
        let generated = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if generated.starts_with("lm_") {
            let _ = std::fs::write(&key_file, &generated);
            return generated;
        }
    }

    // Fallback pseudo-random token if node eval somehow fails
    let fallback = format!("lm_{:016x}{:016x}{:016x}{:016x}",
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(54321),
        std::process::id(),
        0xfeedface_u64,
        0xcafebabe_u64
    );
    let _ = std::fs::write(&key_file, &fallback);
    fallback
}

fn get_management_token(state: &SupervisorState) -> String {
    if let Some(ref t) = state.management_token {
        return t.clone();
    }
    if let Some(ref dir) = state.data_dir {
        let key_file = dir.join("management-token.key");
        if let Ok(content) = std::fs::read_to_string(&key_file) {
            let trimmed = content.trim();
            if trimmed.starts_with("lm_") {
                return trimmed.to_string();
            }
        }
    }
    let default_key = std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("LocalBridge")
        .join("data")
        .join("management-token.key");
    if let Ok(content) = std::fs::read_to_string(&default_key) {
        let trimmed = content.trim();
        if trimmed.starts_with("lm_") {
            return trimmed.to_string();
        }
    }
    String::new()
}

fn decode_chunked(body: &str) -> String {
    let mut result = String::new();
    let mut rem = body;
    while let Some(pos) = rem.find("\r\n") {
        let size_hex = rem[..pos].trim();
        if let Ok(size) = usize::from_str_radix(size_hex, 16) {
            if size == 0 {
                break;
            }
            let chunk_start = pos + 2;
            if chunk_start + size <= rem.len() {
                result.push_str(&rem[chunk_start..chunk_start + size]);
                let next = chunk_start + size;
                rem = if next + 2 <= rem.len() && &rem[next..next + 2] == "\r\n" {
                    &rem[next + 2..]
                } else if next <= rem.len() {
                    &rem[next..]
                } else {
                    ""
                };
            } else {
                result.push_str(&rem[chunk_start..]);
                break;
            }
        } else {
            result.push_str(rem);
            break;
        }
    }
    result
}

fn loopback_management_request(
    port: u16,
    token: &str,
    method: &str,
    path: &str,
    body: Option<&serde_json::Value>,
) -> Result<serde_json::Value, String> {
    use std::io::{Read, Write};

    let body_str = body.map(|b| b.to_string()).unwrap_or_default();
    let body_bytes = body_str.as_bytes();

    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .map_err(|e| format!("Failed to connect to local server (127.0.0.1:{}): {}", port, e))?;

    stream.set_read_timeout(Some(Duration::from_secs(15))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(15))).ok();

    let mut header = format!(
        "{} {} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n",
        method, path, port
    );
    if !token.is_empty() {
        header.push_str(&format!("Authorization: Bearer {}\r\n", token));
    }
    if !body_bytes.is_empty() {
        header.push_str("Content-Type: application/json\r\n");
        header.push_str(&format!("Content-Length: {}\r\n", body_bytes.len()));
    } else {
        header.push_str("Content-Length: 0\r\n");
    }
    header.push_str("\r\n");

    stream.write_all(header.as_bytes()).map_err(|e| format!("Write failed: {}", e))?;
    if !body_bytes.is_empty() {
        stream.write_all(body_bytes).map_err(|e| format!("Write body failed: {}", e))?;
    }
    stream.flush().ok();

    let mut raw_response = Vec::new();
    stream.read_to_end(&mut raw_response).map_err(|e| format!("Read failed: {}", e))?;

    let response_str = String::from_utf8_lossy(&raw_response);
    let mut parts = response_str.splitn(2, "\r\n\r\n");
    let headers_part = parts.next().unwrap_or("");
    let body_part = parts.next().unwrap_or("");

    let status_line = headers_part.lines().next().unwrap_or("");
    let status_code: u16 = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(500);

    let clean_body = if headers_part.to_lowercase().contains("transfer-encoding: chunked") {
        decode_chunked(body_part)
    } else {
        body_part.to_string()
    };

    if status_code >= 200 && status_code < 300 {
        if clean_body.trim().is_empty() {
            Ok(serde_json::json!({ "success": true }))
        } else {
            serde_json::from_str(&clean_body)
                .map_err(|e| format!("JSON decode error: {} - body: {}", e, clean_body))
        }
    } else {
        if let Ok(err_json) = serde_json::from_str::<serde_json::Value>(&clean_body) {
            let msg = err_json.get("error")
                .or_else(|| err_json.get("message"))
                .and_then(|v| v.as_str())
                .unwrap_or(&clean_body);
            Err(msg.to_string())
        } else {
            Err(format!("HTTP {}: {}", status_code, clean_body))
        }
    }
}

#[tauri::command]
fn desktop_management_call(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    method: String,
    path: String,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let (port, token) = {
        let s = state.lock().map_err(|e| e.to_string())?;
        let port = if s.server_port > 0 { s.server_port } else { 18080 };
        let token = get_management_token(&s);
        (port, token)
    };
    loopback_management_request(port, &token, &method, &path, body.as_ref())
}

#[tauri::command]
fn desktop_set_server_url(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    url: String,
) -> Result<(), String> {
    if let Ok(mut s) = state.lock() {
        if let Some(pos) = url.rfind(':') {
            if let Ok(port) = url[pos + 1..].trim_matches('/').parse::<u16>() {
                s.server_port = port;
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn desktop_authorize_project(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    path: String,
    name: Option<String>,
    access_mode: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({
        "path": path,
    });
    if let Some(n) = name {
        payload["name"] = serde_json::Value::String(n);
    }
    if let Some(m) = access_mode {
        payload["accessMode"] = serde_json::Value::String(m);
    }
    desktop_management_call(state, "POST".into(), "/api/management/projects/authorize".into(), Some(payload))
}

#[tauri::command]
fn desktop_set_project_access(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: String,
    access_mode: String,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({ "accessMode": access_mode });
    desktop_management_call(state, "POST".into(), format!("/api/management/projects/{}/access", project_id), Some(payload))
}

#[tauri::command]
fn desktop_set_project_execution(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: String,
    execution_mode: String,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({ "executionMode": execution_mode });
    desktop_management_call(state, "POST".into(), format!("/api/management/projects/{}/execution", project_id), Some(payload))
}

#[tauri::command]
fn desktop_enable_project(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: String,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "POST".into(), format!("/api/management/projects/{}/enable", project_id), None)
}

#[tauri::command]
fn desktop_disable_project(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: String,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "POST".into(), format!("/api/management/projects/{}/disable", project_id), None)
}

#[tauri::command]
fn desktop_remove_project(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: String,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "DELETE".into(), format!("/api/management/projects/{}", project_id), None)
}

#[tauri::command]
fn desktop_create_token(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    name: String,
    token_type: String,
    scopes: Option<Vec<String>>,
    expires_at: Option<i64>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({
        "name": name,
        "type": token_type,
    });
    if let Some(s) = scopes {
        payload["scopes"] = serde_json::json!(s);
    }
    if let Some(exp) = expires_at {
        payload["expiresAt"] = serde_json::json!(exp);
    }
    desktop_management_call(state, "POST".into(), "/api/tokens".into(), Some(payload))
}

#[tauri::command]
fn desktop_revoke_token(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    token_id: String,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "DELETE".into(), format!("/api/tokens/{}", token_id), None)
}

#[tauri::command]
fn desktop_list_tokens(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/tokens".into(), None)
}

#[tauri::command]
fn desktop_list_approvals(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: Option<String>,
    status: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut qs = Vec::new();
    if let Some(p) = project_id {
        qs.push(format!("projectId={}", p));
    }
    if let Some(s) = status {
        qs.push(format!("status={}", s));
    }
    let path = if qs.is_empty() {
        "/api/approvals".to_string()
    } else {
        format!("/api/approvals?{}", qs.join("&"))
    };
    desktop_management_call(state, "GET".into(), path, None)
}

#[tauri::command]
fn desktop_resolve_approval(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    approval_id: String,
    action: String,
    resolved_by: Option<String>,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "action": action,
        "resolvedBy": resolved_by.unwrap_or_else(|| "desktop-user".into()),
    });
    desktop_management_call(state, "POST".into(), format!("/api/approvals/{}/resolve", approval_id), Some(payload))
}

#[tauri::command]
fn desktop_list_jobs(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: Option<String>,
    limit: Option<u32>,
) -> Result<serde_json::Value, String> {
    let mut qs = Vec::new();
    if let Some(p) = project_id {
        qs.push(format!("projectId={}", p));
    }
    if let Some(l) = limit {
        qs.push(format!("limit={}", l));
    }
    let path = if qs.is_empty() {
        "/api/jobs".to_string()
    } else {
        format!("/api/jobs?{}", qs.join("&"))
    };
    desktop_management_call(state, "GET".into(), path, None)
}

#[tauri::command]
fn desktop_cancel_job(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    job_id: String,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "POST".into(), format!("/api/jobs/{}/cancel", job_id), None)
}

#[tauri::command]
fn desktop_get_pause_state(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/pause".into(), None)
}

#[tauri::command]
fn desktop_set_pause_state(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    paused: bool,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({ "paused": paused });
    desktop_management_call(state, "POST".into(), "/api/pause".into(), Some(payload))
}

#[tauri::command]
fn desktop_emergency_stop(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    reason: Option<String>,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "reason": reason.unwrap_or_else(|| "Emergency stop initiated from Desktop".into()),
    });
    desktop_management_call(state, "POST".into(), "/api/emergency-stop".into(), Some(payload))
}

#[tauri::command]
fn desktop_list_audit(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    limit: Option<u32>,
) -> Result<serde_json::Value, String> {
    let path = format!("/api/audit?limit={}", limit.unwrap_or(100));
    desktop_management_call(state, "GET".into(), path, None)
}

#[tauri::command]
fn desktop_list_projects(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/projects".into(), None)
}

#[tauri::command]
fn desktop_get_status(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/status".into(), None)
}

#[tauri::command]
fn desktop_get_mcp_status(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/mcp/status".into(), None)
}

#[tauri::command]
fn desktop_list_runners(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    let val = desktop_management_call(state, "GET".into(), "/api/runners".into(), None)?;
    if val.is_array() {
        Ok(serde_json::json!({ "runners": val }))
    } else {
        Ok(val)
    }
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

    // 4. Retrieve or generate runner token and management token
    let runner_token = get_or_create_runner_token(&node_path, &data_dir);
    let management_token = get_or_create_management_token(&node_path, &data_dir);

    // 5. Update state
    if let Ok(mut state) = supervisor.lock() {
        state.bundled_node = Some(node_path.clone());
        state.server_entry = Some(server_entry.clone());
        state.runner_entry = Some(runner_entry.clone());
        state.runner_token = Some(runner_token.clone());
        state.management_token = Some(management_token.clone());
        state.server_port = 18080;
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
        server_cmd.env("LOCALBRIDGE_MANAGEMENT_TOKEN", &management_token);

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
            check_desktop_health,
            desktop_management_call,
            desktop_authorize_project,
            desktop_set_project_access,
            desktop_set_project_execution,
            desktop_enable_project,
            desktop_disable_project,
            desktop_remove_project,
            desktop_create_token,
            desktop_revoke_token,
            desktop_list_tokens,
            desktop_list_approvals,
            desktop_resolve_approval,
            desktop_list_jobs,
            desktop_cancel_job,
            desktop_get_pause_state,
            desktop_set_pause_state,
            desktop_emergency_stop,
            desktop_list_audit,
            desktop_list_projects,
            desktop_get_status,
            desktop_get_mcp_status,
            desktop_list_runners,
            desktop_set_server_url
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
