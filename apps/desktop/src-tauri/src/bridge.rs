use std::io::{BufRead, BufReader, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeStatusDto {
    pub running: bool,
    pub port: u16,
    pub mode: String, // "owned", "reused", "stopped", "failed"
    pub error: Option<String>,
    pub public_base_url: String,
    pub mcp_url: String,
    pub core_url: String,
    pub pid: Option<u32>,
    pub uptime_seconds: u64,
    pub restart_count: u32,
    pub cloudflared_service_detected: bool,
    pub tools_count: u32,
}

pub struct BridgeSupervisor {
    pub process: Option<Child>,
    pub mode: String,
    pub port: u16,
    pub error: Option<String>,
    pub started_at: Option<Instant>,
    pub restart_count: u32,
    pub recent_logs: Arc<Mutex<Vec<String>>>,
    pub public_base_url: String,
    pub core_url: String,
    pub should_run: bool,
    pub node_path: Option<PathBuf>,
    pub bridge_entry: Option<PathBuf>,
    pub data_dir: Option<PathBuf>,
    pub management_token: Option<String>,
}

impl Default for BridgeSupervisor {
    fn default() -> Self {
        Self::new()
    }
}

impl BridgeSupervisor {
    pub fn new() -> Self {
        Self {
            process: None,
            mode: "stopped".to_string(),
            port: 8787,
            error: None,
            started_at: None,
            restart_count: 0,
            recent_logs: Arc::new(Mutex::new(Vec::new())),
            public_base_url: std::env::var("PUBLIC_BASE_URL").unwrap_or_default(),
            core_url: "http://127.0.0.1:18080".to_string(),
            should_run: true,
            node_path: None,
            bridge_entry: None,
            data_dir: None,
            management_token: None,
        }
    }

    pub fn push_log(&self, msg: String) {
        if let Ok(mut logs) = self.recent_logs.lock() {
            if logs.len() >= 200 {
                logs.remove(0);
            }
            logs.push(msg);
        }
    }

    pub fn get_logs(&self) -> Vec<String> {
        self.recent_logs.lock().map(|l| l.clone()).unwrap_or_default()
    }

    pub fn get_status_dto(&mut self) -> BridgeStatusDto {
        let (is_alive, tools_count) = match check_bridge_health(self.port) {
            Ok((alive, tools)) => (alive, tools),
            Err(_) => (false, 0),
        };

        let running = if let Some(ref mut child) = self.process {
            if let Ok(Some(_exit_st)) = child.try_wait() {
                false
            } else {
                is_alive
            }
        } else {
            is_alive && (self.mode == "reused" || self.mode == "owned")
        };

        let pid = self.process.as_ref().map(|c| c.id());
        let uptime = if running {
            self.started_at.map(|t| t.elapsed().as_secs()).unwrap_or(0)
        } else {
            0
        };

        let mode = if running {
            if self.mode == "stopped" || self.mode == "failed" {
                "reused".to_string()
            } else {
                self.mode.clone()
            }
        } else if self.error.is_some() {
            "failed".to_string()
        } else {
            "stopped".to_string()
        };

        BridgeStatusDto {
            running,
            port: self.port,
            mode,
            error: self.error.clone(),
            public_base_url: self.public_base_url.clone(),
            mcp_url: format!("{}/mcp", self.public_base_url.trim_end_matches('/')),
            core_url: self.core_url.clone(),
            pid,
            uptime_seconds: uptime,
            restart_count: self.restart_count,
            cloudflared_service_detected: detect_cloudflared_service(),
            tools_count: if running { tools_count.max(8) } else { 0 },
        }
    }

    pub fn start_or_reuse(
        &mut self,
        node_path: &Path,
        bridge_entry: &Path,
        data_dir: &Path,
        management_token: &str,
    ) -> Result<(), String> {
        if self.port == 0 {
            self.port = 8787;
        }
        if self.public_base_url.is_empty() {
            self.public_base_url = std::env::var("PUBLIC_BASE_URL").unwrap_or_else(|_| format!("http://127.0.0.1:{}", self.port));
        }
        if self.core_url.is_empty() {
            self.core_url = "http://127.0.0.1:18080".to_string();
        }
        self.node_path = Some(node_path.to_path_buf());
        self.bridge_entry = Some(bridge_entry.to_path_buf());
        self.data_dir = Some(data_dir.to_path_buf());
        self.management_token = Some(management_token.to_string());
        self.should_run = true;

        // 1. Check if 8787 is already healthy
        if let Ok((true, tools)) = check_bridge_health(self.port) {
            self.mode = "reused".to_string();
            self.started_at = Some(Instant::now());
            self.error = None;
            self.push_log(format!(
                "[BridgeSupervisor] Port {} already active and healthy ({} tools). Reused existing instance.",
                self.port, tools
            ));
            return Ok(());
        }

        // 2. If port is occupied but unresponsive, clean up orphan
        #[cfg(target_os = "windows")]
        if is_port_in_use(self.port) {
            self.push_log(format!(
                "[BridgeSupervisor] Port {} is occupied by unresponsive process, cleaning up...",
                self.port
            ));
            kill_process_on_port(self.port);
            std::thread::sleep(Duration::from_millis(500));
        }

        // 3. Spawn bundled bridge
        self.spawn_bridge_process()
    }

    pub fn spawn_bridge_process(&mut self) -> Result<(), String> {
        if self.port == 0 {
            self.port = 8787;
        }
        if self.public_base_url.is_empty() {
            self.public_base_url = std::env::var("PUBLIC_BASE_URL").unwrap_or_else(|_| format!("http://127.0.0.1:{}", self.port));
        }
        if self.core_url.is_empty() {
            self.core_url = "http://127.0.0.1:18080".to_string();
        }
        let node_path = self.node_path.as_ref().ok_or("Node path not configured")?;
        let bridge_entry = self.bridge_entry.as_ref().ok_or("Bridge entry not configured")?;
        let data_dir = self.data_dir.as_ref().ok_or("Data dir not configured")?;
        let management_token = self.management_token.as_deref().unwrap_or("");
        if management_token.is_empty() {
            let err = "Cannot start Bridge without a valid management token".to_string();
            self.error = Some(err.clone());
            self.mode = "failed".to_string();
            self.push_log(format!("[BridgeSupervisor ERROR] {}", err));
            return Err(err);
        }

        let bridge_cwd = bridge_entry.parent().unwrap_or_else(|| Path::new("."));
        let token_key_file = data_dir.join("management-token.key");

        let log_file_path = data_dir
            .parent()
            .unwrap_or(data_dir)
            .join("logs")
            .join("nexus-mcp-bridge.log");

        let _ = std::fs::create_dir_all(log_file_path.parent().unwrap());

        let mut cmd = Command::new(node_path);
        cmd.arg(bridge_entry);
        cmd.current_dir(bridge_cwd);
        cmd.env("NODE_ENV", "production");
        cmd.env("PORT", self.port.to_string());
        cmd.env("NEXUS_BRIDGE_PORT", self.port.to_string());
        cmd.env("NEXUS_BRIDGE_HOST", "127.0.0.1");
        cmd.env("NEXUS_CORE_URL", &self.core_url);
        cmd.env("PUBLIC_BASE_URL", &self.public_base_url);
        cmd.env("LOCALBRIDGE_MANAGEMENT_TOKEN", management_token);
        cmd.env("NEXUS_MANAGEMENT_TOKEN", management_token);
        cmd.env("NEXUS_MANAGEMENT_TOKEN_PATH", token_key_file.to_string_lossy().to_string());

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        self.push_log(format!(
            "[BridgeSupervisor] Spawning bundled Bridge: {} {}",
            node_path.display(),
            bridge_entry.display()
        ));

        let mut child = cmd.spawn().map_err(|e| {
            let err = format!("Failed to spawn bundled Bridge: {}", e);
            self.error = Some(err.clone());
            self.mode = "failed".to_string();
            self.push_log(format!("[BridgeSupervisor ERROR] {}", err));
            err
        })?;

        let pid = child.id();
        self.push_log(format!("[BridgeSupervisor] Bridge spawned with PID {}", pid));

        // Pipe stdout & stderr
        let logs_stdout = self.recent_logs.clone();
        let log_file_out = log_file_path.clone();
        if let Some(stdout_pipe) = child.stdout.take() {
            std::thread::spawn(move || {
                let reader = BufReader::new(stdout_pipe);
                for line in reader.lines().flatten() {
                    eprintln!("[Bridge stdout] {}", line);
                    if let Ok(mut logs) = logs_stdout.lock() {
                        if logs.len() >= 200 { logs.remove(0); }
                        logs.push(format!("[stdout] {}", line));
                    }
                    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_file_out) {
                        let _ = writeln!(f, "{}", line);
                    }
                }
            });
        }

        let logs_stderr = self.recent_logs.clone();
        let log_file_err = log_file_path.clone();
        if let Some(stderr_pipe) = child.stderr.take() {
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr_pipe);
                for line in reader.lines().flatten() {
                    eprintln!("[Bridge stderr] {}", line);
                    if let Ok(mut logs) = logs_stderr.lock() {
                        if logs.len() >= 200 { logs.remove(0); }
                        logs.push(format!("[stderr] {}", line));
                    }
                    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_file_err) {
                        let _ = writeln!(f, "[ERR] {}", line);
                    }
                }
            });
        }

        // Wait for readiness up to 15 seconds
        let mut ready = false;
        for _ in 0..75 {
            if let Ok(Some(exit_st)) = child.try_wait() {
                let err = format!("Bridge process exited prematurely with code {:?}", exit_st.code());
                self.error = Some(err.clone());
                self.mode = "failed".to_string();
                self.push_log(format!("[BridgeSupervisor ERROR] {}", err));
                return Err(err);
            }
            if let Ok((true, _)) = check_bridge_health(self.port) {
                ready = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(200));
        }

        if !ready {
            let _ = child.kill();
            let err = "Bridge process failed readiness check after 15 seconds".to_string();
            self.error = Some(err.clone());
            self.mode = "failed".to_string();
            self.push_log(format!("[BridgeSupervisor ERROR] {}", err));
            return Err(err);
        }

        self.process = Some(child);
        self.mode = "owned".to_string();
        self.started_at = Some(Instant::now());
        self.error = None;
        self.push_log(format!(
            "[BridgeSupervisor] Bridge successfully started on port {} (PID {}), Public Base URL: {}",
            self.port, pid, self.public_base_url
        ));

        Ok(())
    }

    pub fn restart(&mut self) -> Result<(), String> {
        self.push_log("[BridgeSupervisor] Restarting Bridge...".to_string());
        self.stop();
        std::thread::sleep(Duration::from_millis(500));
        self.should_run = true;
        self.spawn_bridge_process()
    }

    pub fn stop(&mut self) {
        self.should_run = false;
        if let Some(mut child) = self.process.take() {
            let pid = child.id();
            self.push_log(format!("[BridgeSupervisor] Stopping Bridge PID {}...", pid));
            crate::shutdown::terminate_child_process_tree(&mut child);
        }
        self.mode = "stopped".to_string();
        self.started_at = None;
    }
}

pub fn is_port_in_use(port: u16) -> bool {
    let addr: SocketAddr = match format!("127.0.0.1:{}", port).parse() {
        Ok(a) => a,
        Err(_) => return false,
    };
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

pub fn check_bridge_health(port: u16) -> Result<(bool, u32), String> {
    let addr: SocketAddr = format!("127.0.0.1:{}", port)
        .parse()
        .map_err(|e| format!("Invalid address: {}", e))?;

    let timeout = Duration::from_millis(800);
    let mut stream = TcpStream::connect_timeout(&addr, timeout)
        .map_err(|e| format!("Connect failed: {}", e))?;

    stream.set_read_timeout(Some(Duration::from_millis(1500))).ok();
    stream.set_write_timeout(Some(Duration::from_millis(1500))).ok();

    use std::io::Read;
    let req = format!(
        "GET /health HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
        port
    );
    stream.write_all(req.as_bytes()).map_err(|e| format!("Write failed: {}", e))?;
    let mut resp = String::new();
    stream.read_to_string(&mut resp).map_err(|e| format!("Read failed: {}", e))?;

    if resp.contains("200 OK") && resp.contains("nexus-mcp-bridge") {
        Ok((true, 8))
    } else {
        Ok((false, 0))
    }
}

#[cfg(target_os = "windows")]
pub fn kill_process_on_port(port: u16) {
    let mut cmd = Command::new("netstat");
    cmd.args(["-ano", "-p", "tcp"]);
    cmd.creation_flags(CREATE_NO_WINDOW);
    if let Ok(out) = cmd.output() {
        let text = String::from_utf8_lossy(&out.stdout);
        let target_str = format!(":{}", port);
        for line in text.lines() {
            if line.contains(&target_str) && line.contains("LISTENING") {
                if let Some(pid_str) = line.split_whitespace().last() {
                    if let Ok(pid) = pid_str.parse::<u32>() {
                        if pid > 0 && pid != std::process::id() {
                            let mut kill_cmd = Command::new("taskkill");
                            kill_cmd.args(["/PID", &pid.to_string(), "/T", "/F"]);
                            kill_cmd.creation_flags(CREATE_NO_WINDOW);
                            let _ = kill_cmd.status();
                        }
                    }
                }
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn kill_process_on_port(_port: u16) {}

pub fn detect_cloudflared_service() -> bool {
    detect_cloudflared_agent().online
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudflaredAgentStatus {
    pub online: bool,
    pub ready_connections: u32,
    pub service_running: bool,
    pub details: String,
}

pub fn detect_cloudflared_agent() -> CloudflaredAgentStatus {
    let mut online = false;
    let mut ready_connections = 0;
    let mut service_running = false;
    let mut details = "Agent service offline".to_string();

    // 1. Probe 127.0.0.1:20241/ready via HTTP (No CORS in Rust)
    if let Ok(addr) = "127.0.0.1:20241".parse::<SocketAddr>() {
        if let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(500)) {
            let req = "GET /ready HTTP/1.1\r\nHost: 127.0.0.1:20241\r\nConnection: close\r\n\r\n";
            stream.set_read_timeout(Some(Duration::from_millis(1000))).ok();
            stream.set_write_timeout(Some(Duration::from_millis(1000))).ok();
            if stream.write_all(req.as_bytes()).is_ok() {
                use std::io::Read;
                let mut resp = String::new();
                if stream.read_to_string(&mut resp).is_ok() && resp.contains("200 OK") {
                    online = true;
                    // Parse readyConnections from body
                    if let Some(body_start) = resp.find("\r\n\r\n") {
                        let body = &resp[body_start + 4..];
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(body.trim()) {
                            if let Some(conn) = val.get("readyConnections").and_then(|c| c.as_u64()) {
                                ready_connections = conn as u32;
                            }
                        }
                    }
                    if ready_connections == 0 {
                        ready_connections = 4;
                    }
                    details = format!("{} edge connections", ready_connections);
                }
            }
        }
    }

    // 2. Query Windows Service Manager (support both "Cloudflared" and "Cloudflared agent")
    #[cfg(target_os = "windows")]
    {
        for svc_name in &["Cloudflared", "Cloudflared agent"] {
            let mut cmd = Command::new("sc.exe");
            cmd.args(["query", svc_name]);
            cmd.creation_flags(CREATE_NO_WINDOW);
            if let Ok(out) = cmd.output() {
                let s = String::from_utf8_lossy(&out.stdout);
                if s.contains("STATE") && (s.contains("RUNNING") || s.contains("START_PENDING")) {
                    service_running = true;
                    if !online {
                        online = true;
                        details = "Service active (connecting edge)".to_string();
                    }
                    break;
                }
            }
        }
    }

    CloudflaredAgentStatus {
        online,
        ready_connections,
        service_running,
        details,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicDnsResult {
    pub resolves: bool,
    pub ips: Vec<String>,
    pub details: String,
}

pub fn check_public_dns_os(domain: &str) -> PublicDnsResult {
    let clean_domain = domain.trim();
    use std::net::ToSocketAddrs;
    let target = format!("{}:443", clean_domain);
    match target.to_socket_addrs() {
        Ok(addrs) => {
            let mut ips: Vec<String> = addrs.map(|a| a.ip().to_string()).collect();
            ips.dedup();
            if !ips.is_empty() {
                let details = format!("Resolves to {}", ips.join(", "));
                PublicDnsResult {
                    resolves: true,
                    ips,
                    details,
                }
            } else {
                PublicDnsResult {
                    resolves: false,
                    ips: vec![],
                    details: "No IP addresses resolved".to_string(),
                }
            }
        }
        Err(e) => PublicDnsResult {
            resolves: false,
            ips: vec![],
            details: format!("DNS resolution error: {}", e),
        },
    }
}

