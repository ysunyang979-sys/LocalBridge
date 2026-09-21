use std::net::TcpStream;
use std::path::Path;
use std::process::{Child, Command};
use std::time::Duration;
use serde::{Deserialize, Serialize};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
pub mod dpapi {
    use std::ptr;

    #[allow(non_snake_case)]
    #[repr(C)]
    struct DATA_BLOB {
        cbData: u32,
        pbData: *mut u8,
    }

    #[link(name = "crypt32")]
    extern "system" {
        fn CryptProtectData(
            pDataIn: *const DATA_BLOB,
            szDataDescr: *const u16,
            pOptionalEntropy: *const DATA_BLOB,
            pvReserved: *mut std::ffi::c_void,
            pPromptStruct: *mut std::ffi::c_void,
            dwFlags: u32,
            pDataOut: *mut DATA_BLOB,
        ) -> i32;

        fn CryptUnprotectData(
            pDataIn: *const DATA_BLOB,
            szDataDescr: *mut *mut u16,
            pOptionalEntropy: *const DATA_BLOB,
            pvReserved: *mut std::ffi::c_void,
            pPromptStruct: *mut std::ffi::c_void,
            dwFlags: u32,
            pDataOut: *mut DATA_BLOB,
        ) -> i32;

        fn LocalFree(hMem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    }

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

    pub fn encrypt(data: &[u8]) -> Result<Vec<u8>, String> {
        let in_blob = DATA_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        };
        let mut out_blob = DATA_BLOB {
            cbData: 0,
            pbData: ptr::null_mut(),
        };

        unsafe {
            let res = CryptProtectData(
                &in_blob,
                ptr::null(),
                ptr::null(),
                ptr::null_mut(),
                ptr::null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out_blob,
            );
            if res == 0 {
                return Err("Windows DPAPI CryptProtectData failed".into());
            }
            let slice = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize);
            let result = slice.to_vec();
            LocalFree(out_blob.pbData as _);
            Ok(result)
        }
    }

    pub fn decrypt(data: &[u8]) -> Result<Vec<u8>, String> {
        let in_blob = DATA_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        };
        let mut out_blob = DATA_BLOB {
            cbData: 0,
            pbData: ptr::null_mut(),
        };

        unsafe {
            let res = CryptUnprotectData(
                &in_blob,
                ptr::null_mut(),
                ptr::null(),
                ptr::null_mut(),
                ptr::null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out_blob,
            );
            if res == 0 {
                return Err("Windows DPAPI CryptUnprotectData failed".into());
            }
            let slice = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize);
            let result = slice.to_vec();
            LocalFree(out_blob.pbData as _);
            Ok(result)
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub mod dpapi {
    pub fn encrypt(data: &[u8]) -> Result<Vec<u8>, String> {
        Ok(data.to_vec())
    }
    pub fn decrypt(data: &[u8]) -> Result<Vec<u8>, String> {
        Ok(data.to_vec())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TunnelNetworkMode {
    Direct,
    System,
    Custom,
}

impl Default for TunnelNetworkMode {
    fn default() -> Self {
        TunnelNetworkMode::System
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelConfig {
    pub tunnel_id: String,
    pub runtime_api_key: String,
    pub mcp_token: String,
    #[serde(default = "default_true")]
    pub auto_reconnect: bool,
    #[serde(default = "default_health_port")]
    pub health_port: u16,
    #[serde(default)]
    pub network_mode: TunnelNetworkMode,
    #[serde(default)]
    pub custom_proxy_url: Option<String>,
}

fn default_true() -> bool {
    true
}

fn default_health_port() -> u16 {
    8080
}

impl TunnelConfig {
    pub fn load_encrypted(data_dir: &Path) -> Result<Option<Self>, String> {
        let path = data_dir.join("tunnel-config.enc");
        if !path.exists() {
            return Ok(None);
        }
        let encrypted = std::fs::read(&path)
            .map_err(|e| format!("Failed to read tunnel config file: {}", e))?;
        let decrypted = dpapi::decrypt(&encrypted)
            .map_err(|e| format!("Failed to decrypt tunnel secrets: {}", e))?;
        let config: TunnelConfig = serde_json::from_slice(&decrypted)
            .map_err(|e| format!("Invalid tunnel config JSON: {}", e))?;
        Ok(Some(config))
    }

    pub fn save_encrypted(&self, data_dir: &Path) -> Result<(), String> {
        let json_bytes = serde_json::to_vec(self)
            .map_err(|e| format!("Failed to serialize tunnel config: {}", e))?;
        let encrypted = dpapi::encrypt(&json_bytes)
            .map_err(|e| format!("Failed to encrypt tunnel secrets: {}", e))?;
        let path = data_dir.join("tunnel-config.enc");
        let temp_path = data_dir.join(format!(".tunnel-config.{}.tmp", std::process::id()));

        use std::io::Write;
        let res = (|| -> std::io::Result<()> {
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp_path)?;
            file.write_all(&encrypted)?;
            file.sync_all()?;
            std::fs::rename(&temp_path, &path)?;
            Ok(())
        })();

        if let Err(e) = res {
            let _ = std::fs::remove_file(&temp_path);
            return Err(format!("Atomic tunnel config write failed: {}", e));
        }
        Ok(())
    }

    pub fn delete_encrypted(data_dir: &Path) -> Result<(), String> {
        let path = data_dir.join("tunnel-config.enc");
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| format!("Failed to delete tunnel config: {}", e))?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TunnelStatus {
    NotConfigured,
    Stopped,
    Starting,
    Connecting,
    Connected,
    Reconnecting,
    AuthenticationError,
    LocalMcpUnavailable,
    HealthPortConflict,
    RuntimeMissing,
    Error,
    NeedsAttention,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelStatusDto {
    pub configured: bool,
    pub status: String,
    pub tunnel_id: Option<String>,
    pub has_api_key: bool,
    pub has_mcp_token: bool,
    pub auto_reconnect: bool,
    pub health_port: u16,
    pub network_mode: String,
    pub custom_proxy_url: Option<String>,
    pub active_proxy_url: Option<String>,
    pub proxy_status: Option<String>,
    pub control_plane_status: Option<String>,
    pub local_mcp_status: Option<String>,
    pub last_successful_poll_at: Option<u64>,
    pub poll_errors: u64,
    pub error_message: Option<String>,
    pub reconnect_attempts: u32,
}

pub struct TunnelSupervisor {
    pub process: Option<Child>,
    pub status: TunnelStatus,
    pub error_message: Option<String>,
    pub config: Option<TunnelConfig>,
    pub reconnect_attempts: u32,
    pub should_run: bool,
    pub active_proxy_url: Option<String>,
    pub proxy_status: Option<String>,
    pub control_plane_status: Option<String>,
    pub local_mcp_status: Option<String>,
    pub last_successful_poll_at: Option<u64>,
    pub poll_errors: u64,
}

impl Default for TunnelSupervisor {
    fn default() -> Self {
        Self {
            process: None,
            status: TunnelStatus::NotConfigured,
            error_message: None,
            config: None,
            reconnect_attempts: 0,
            should_run: false,
            active_proxy_url: None,
            proxy_status: None,
            control_plane_status: None,
            local_mcp_status: None,
            last_successful_poll_at: None,
            poll_errors: 0,
        }
    }
}

impl TunnelSupervisor {
    pub fn init_from_disk(&mut self, data_dir: &Path) {
        match TunnelConfig::load_encrypted(data_dir) {
            Ok(Some(cfg)) => {
                self.config = Some(cfg);
                self.status = TunnelStatus::Stopped;
            }
            Ok(None) => {
                self.config = None;
                self.status = TunnelStatus::NotConfigured;
            }
            Err(e) => {
                self.config = None;
                self.status = TunnelStatus::Error;
                self.error_message = Some(format!("Failed to load encrypted secrets: {}", e));
            }
        }
    }

    pub fn get_status_dto(&self) -> TunnelStatusDto {
        let has_config = self.config.is_some();
        let (tunnel_id, has_api_key, has_mcp_token, auto_reconnect, health_port, network_mode, custom_proxy_url) = match &self.config {
            Some(c) => (
                Some(c.tunnel_id.clone()),
                !c.runtime_api_key.trim().is_empty(),
                !c.mcp_token.trim().is_empty(),
                c.auto_reconnect,
                c.health_port,
                match c.network_mode {
                    TunnelNetworkMode::Direct => "direct".to_string(),
                    TunnelNetworkMode::System => "system".to_string(),
                    TunnelNetworkMode::Custom => "custom".to_string(),
                },
                c.custom_proxy_url.clone(),
            ),
            None => (None, false, false, true, 8080, "system".to_string(), None),
        };

        TunnelStatusDto {
            configured: has_config && has_api_key && has_mcp_token,
            status: format!("{:?}", self.status),
            tunnel_id,
            has_api_key,
            has_mcp_token,
            auto_reconnect,
            health_port,
            network_mode,
            custom_proxy_url,
            active_proxy_url: self.active_proxy_url.clone(),
            proxy_status: self.proxy_status.clone(),
            control_plane_status: self.control_plane_status.clone(),
            local_mcp_status: self.local_mcp_status.clone(),
            last_successful_poll_at: self.last_successful_poll_at,
            poll_errors: self.poll_errors,
            error_message: self.error_message.clone(),
            reconnect_attempts: self.reconnect_attempts,
        }
    }

    pub fn set_config(&mut self, config: TunnelConfig, data_dir: &Path) -> Result<(), String> {
        config.save_encrypted(data_dir)?;
        self.config = Some(config);
        if self.status == TunnelStatus::NotConfigured || self.status == TunnelStatus::Error {
            self.status = TunnelStatus::Stopped;
            self.error_message = None;
        }
        Ok(())
    }

    pub fn clear_config(&mut self, data_dir: &Path) -> Result<(), String> {
        self.stop();
        TunnelConfig::delete_encrypted(data_dir)?;
        self.config = None;
        self.status = TunnelStatus::NotConfigured;
        self.error_message = None;
        self.reconnect_attempts = 0;
        self.should_run = false;
        self.active_proxy_url = None;
        self.proxy_status = None;
        self.control_plane_status = None;
        self.last_successful_poll_at = None;
        self.poll_errors = 0;
        Ok(())
    }

    pub fn is_active(&mut self) -> bool {
        if let Some(ref mut child) = self.process {
            child.try_wait().ok().flatten().is_none()
        } else {
            false
        }
    }

    pub fn check_readyz(port: u16) -> bool {
        let url = format!("http://127.0.0.1:{}/readyz", port);
        if let Ok(resp) = ureq_get(&url) {
            resp.contains("200 OK") || resp.contains("ready") || resp.contains("ok") || resp.contains("OK")
        } else {
            false
        }
    }

    pub fn stop(&mut self) {
        self.should_run = false;
        if let Some(mut child) = self.process.take() {
            terminate_owned_process_tree(&mut child);
        }
        if self.config.is_some() {
            self.status = TunnelStatus::Stopped;
        } else {
            self.status = TunnelStatus::NotConfigured;
        }
        self.reconnect_attempts = 0;
        self.control_plane_status = Some("Idle".into());
    }

    pub fn shutdown(&mut self) {
        self.stop();
    }
}

pub fn normalize_proxy_server(raw: &str) -> String {
    let mut target = raw.trim();
    if target.contains(';') {
        let parts: Vec<&str> = target.split(';').collect();
        let mut https_part = None;
        let mut http_part = None;
        for p in parts.iter() {
            let p = p.trim();
            if p.starts_with("https=") {
                https_part = Some(&p[6..]);
            } else if p.starts_with("http=") {
                http_part = Some(&p[5..]);
            }
        }
        if let Some(h) = https_part {
            target = h;
        } else if let Some(h) = http_part {
            target = h;
        } else if let Some(first) = parts.first() {
            target = first.trim();
        }
    }

    if target.starts_with("https=") {
        target = &target[6..];
    } else if target.starts_with("http=") {
        target = &target[5..];
    }

    if target.starts_with("http://") || target.starts_with("https://") {
        target.to_string()
    } else {
        format!("http://{}", target)
    }
}

pub fn resolve_windows_system_proxy() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("reg");
        cmd.args(["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        let output = cmd.output().map_err(|e| format!("Failed to query Windows registry: {}", e))?;
        if !output.status.success() {
            return Ok(None);
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let mut proxy_enable = 0u32;
        let mut proxy_server: Option<String> = None;
        let mut auto_config_url: Option<String> = None;

        for line in text.lines() {
            let line = line.trim();
            if line.starts_with("ProxyEnable") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 3 {
                    let val = parts[2].trim_start_matches("0x");
                    proxy_enable = u32::from_str_radix(val, 16).unwrap_or(0);
                }
            } else if line.starts_with("ProxyServer") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 3 {
                    proxy_server = Some(parts[2..].join(" "));
                }
            } else if line.starts_with("AutoConfigURL") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 3 {
                    auto_config_url = Some(parts[2..].join(" "));
                }
            }
        }

        if auto_config_url.is_some() && (proxy_server.is_none() || proxy_enable == 0) {
            return Err("PAC proxy detected but unsupported".to_string());
        }

        if proxy_enable == 1 {
            if let Some(srv) = proxy_server {
                return Ok(Some(normalize_proxy_server(&srv)));
            }
        }
        Ok(None)
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(p) = std::env::var("HTTPS_PROXY").or_else(|_| std::env::var("HTTP_PROXY")) {
            if !p.trim().is_empty() {
                return Ok(Some(normalize_proxy_server(&p)));
            }
        }
        Ok(None)
    }
}

pub fn parse_metrics_poll_info(metrics_text: &str) -> (Option<u64>, u64) {
    let mut last_poll = None;
    let mut poll_errors = 0u64;

    for line in metrics_text.lines() {
        let line = line.trim();
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        if line.starts_with("commands_poll_last_successful_timestamp_seconds") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                if let Ok(val) = parts[parts.len() - 1].parse::<f64>() {
                    if val > 0.0 {
                        last_poll = Some(val as u64);
                    }
                }
            }
        } else if line.starts_with("commands_poll_errors_total") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                if let Ok(val) = parts[parts.len() - 1].parse::<f64>() {
                    poll_errors = val as u64;
                }
            }
        }
    }

    (last_poll, poll_errors)
}

pub fn test_proxy_connectivity(proxy_url: &str) -> Result<(), String> {
    let raw = proxy_url.trim_start_matches("http://").trim_start_matches("https://");
    let host_port = raw.split('/').next().unwrap_or(raw);
    let hp = if !host_port.contains(':') {
        format!("{}:80", host_port)
    } else {
        host_port.to_string()
    };
    use std::net::ToSocketAddrs;
    let mut addrs = hp.to_socket_addrs().map_err(|e| format!("Invalid proxy address {}: {}", hp, e))?;
    let addr = addrs.next().ok_or_else(|| format!("Could not resolve proxy address {}", hp))?;
    let stream = TcpStream::connect_timeout(&addr, Duration::from_secs(3))
        .map_err(|e| format!("Proxy unreachable at {}: {}", hp, e))?;
    drop(stream);
    Ok(())
}

pub fn test_proxy_openai_connect(proxy_url: &str) -> Result<(), String> {
    let raw = proxy_url.trim_start_matches("http://").trim_start_matches("https://");
    let host_port = raw.split('/').next().unwrap_or(raw);
    let hp = if !host_port.contains(':') {
        format!("{}:80", host_port)
    } else {
        host_port.to_string()
    };
    use std::net::ToSocketAddrs;
    let mut addrs = hp.to_socket_addrs().map_err(|e| format!("Invalid proxy address {}: {}", hp, e))?;
    let addr = addrs.next().ok_or_else(|| format!("Could not resolve proxy address {}", hp))?;

    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_secs(4))
        .map_err(|e| format!("Proxy connection failed: {}", e))?;
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(4))).ok();

    use std::io::{Read, Write};
    let req = "CONNECT api.openai.com:443 HTTP/1.1\r\nHost: api.openai.com:443\r\nUser-Agent: Nexus-Tunnel-Test\r\n\r\n";
    stream.write_all(req.as_bytes()).map_err(|e| format!("Failed to send CONNECT to proxy: {}", e))?;

    let mut buf = [0u8; 1024];
    let n = stream.read(&mut buf).map_err(|e| format!("Proxy CONNECT read timeout/failed: {}", e))?;
    let resp = String::from_utf8_lossy(&buf[..n]);
    if resp.contains(" 200") || resp.contains("HTTP/1.1 200") || resp.contains("HTTP/1.0 200") {
        Ok(())
    } else {
        Err(format!("Proxy rejected CONNECT to api.openai.com:443: {}", resp.lines().next().unwrap_or("unknown response")))
    }
}

pub fn ureq_get(url: &str) -> Result<String, String> {
    if let Some(uri) = url.strip_prefix("http://") {
        let (host_port, path) = if let Some(idx) = uri.find('/') {
            (&uri[..idx], &uri[idx..])
        } else {
            (uri, "/")
        };
        let host_port_string = if !host_port.contains(':') {
            format!("{}:80", host_port)
        } else {
            host_port.to_string()
        };
        use std::net::ToSocketAddrs;
        let mut addrs = host_port_string.to_socket_addrs().map_err(|e| format!("Invalid address {}: {}", host_port_string, e))?;
        let addr = addrs.next().ok_or_else(|| format!("Could not resolve address {}", host_port_string))?;
        let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(800))
            .map_err(|e| e.to_string())?;

        stream.set_read_timeout(Some(Duration::from_secs(2))).ok();
        stream.set_write_timeout(Some(Duration::from_secs(2))).ok();

        use std::io::{Read, Write};
        let req = format!(
            "GET {} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",
            path, host_port
        );
        stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
        let mut body = String::new();
        stream.read_to_string(&mut body).map_err(|e| e.to_string())?;
        Ok(body)
    } else {
        Err("Unsupported protocol".into())
    }
}

pub fn terminate_owned_process_tree(child: &mut Child) {
    let pid = child.id();
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("taskkill");
        command.args(["/PID", &pid.to_string(), "/T", "/F"]);
        command.creation_flags(CREATE_NO_WINDOW);
        let _ = command.status();
    }
    #[cfg(not(target_os = "windows"))]
    let _ = child.kill();
    #[cfg(target_os = "windows")]
    let _ = child.kill();
    let _ = child.try_wait();
    let _ = child.wait();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dpapi_roundtrip() {
        let secret = b"sk-test-key-1234567890-test";
        let encrypted = dpapi::encrypt(secret).expect("encryption succeeds");
        assert_ne!(encrypted.as_slice(), secret.as_slice());
        let decrypted = dpapi::decrypt(&encrypted).expect("decryption succeeds");
        assert_eq!(decrypted, secret);
    }

    #[test]
    fn test_normalize_proxy_server() {
        assert_eq!(normalize_proxy_server("127.0.0.1:10808"), "http://127.0.0.1:10808");
        assert_eq!(normalize_proxy_server("http://127.0.0.1:10808"), "http://127.0.0.1:10808");
        assert_eq!(normalize_proxy_server("https://127.0.0.1:10808"), "https://127.0.0.1:10808");
        assert_eq!(
            normalize_proxy_server("http=127.0.0.1:8080;https=127.0.0.1:10808"),
            "http://127.0.0.1:10808"
        );
    }

    #[test]
    fn test_parse_metrics_poll_info() {
        let metrics = "
# HELP commands_poll_last_successful_timestamp_seconds Last successful poll timestamp
# TYPE commands_poll_last_successful_timestamp_seconds gauge
commands_poll_last_successful_timestamp_seconds 1726912345.123
commands_poll_errors_total 2
";
        let (last_poll, poll_errors) = parse_metrics_poll_info(metrics);
        assert_eq!(last_poll, Some(1726912345));
        assert_eq!(poll_errors, 2);
    }

    #[test]
    fn test_tunnel_config_encrypted_persistence() {
        let temp_dir = std::env::temp_dir().join(format!("lb_test_tunnel_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let cfg = TunnelConfig {
            tunnel_id: "tunnel_test_123".into(),
            runtime_api_key: "sk-runtime-key".into(),
            mcp_token: "lb_test_token".into(),
            auto_reconnect: true,
            health_port: 8080,
            network_mode: TunnelNetworkMode::System,
            custom_proxy_url: Some("http://127.0.0.1:10808".into()),
        };

        cfg.save_encrypted(&temp_dir).expect("save succeeds");
        let enc_file = temp_dir.join("tunnel-config.enc");
        assert!(enc_file.exists());

        // Raw file content must NOT contain plaintext keys
        let raw_bytes = std::fs::read(&enc_file).unwrap();
        let raw_str = String::from_utf8_lossy(&raw_bytes);
        assert!(!raw_str.contains("sk-runtime-key"));
        assert!(!raw_str.contains("lb_test_token"));

        let loaded = TunnelConfig::load_encrypted(&temp_dir).expect("load succeeds").unwrap();
        assert_eq!(loaded.tunnel_id, "tunnel_test_123");
        assert_eq!(loaded.runtime_api_key, "sk-runtime-key");
        assert_eq!(loaded.mcp_token, "lb_test_token");
        assert_eq!(loaded.network_mode, TunnelNetworkMode::System);
        assert_eq!(loaded.custom_proxy_url.as_deref(), Some("http://127.0.0.1:10808"));

        let mut sup = TunnelSupervisor::default();
        sup.init_from_disk(&temp_dir);
        let dto = sup.get_status_dto();
        assert!(dto.configured);
        assert_eq!(dto.tunnel_id.as_deref(), Some("tunnel_test_123"));
        assert_eq!(dto.network_mode, "system");
        assert_eq!(dto.custom_proxy_url.as_deref(), Some("http://127.0.0.1:10808"));
        assert!(dto.has_api_key);
        assert!(dto.has_mcp_token);

        let dto_json = serde_json::to_string(&dto).unwrap();
        assert!(!dto_json.contains("sk-runtime-key"));
        assert!(!dto_json.contains("lb_test_token"));

        sup.clear_config(&temp_dir).expect("delete succeeds");
        assert!(!enc_file.exists());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
