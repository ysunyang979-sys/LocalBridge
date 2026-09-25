use std::env;
use std::path::PathBuf;
use std::process::{exit, Command};

fn main() {
    let mut exe_path = env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    exe_path.pop(); // current directory: resources/bridge
    let bridge_js = exe_path.join("index.js");

    // Look for bundled runtime node at ../runtime/node or node.exe
    let mut runtime_node = exe_path.clone();
    runtime_node.pop(); // resources/
    runtime_node.push("runtime");
    let node_name = if cfg!(target_os = "windows") { "node.exe" } else { "node" };
    runtime_node.push(node_name);

    let node_bin = if runtime_node.exists() {
        runtime_node
    } else if runtime_node.with_file_name("node.exe").exists() {
        runtime_node.with_file_name("node.exe")
    } else {
        // Fallback to system node if running in development
        PathBuf::from("node")
    };

    let mut cmd = Command::new(&node_bin);
    cmd.arg(&bridge_js);
    for arg in env::args().skip(1) {
        cmd.arg(arg);
    }

    match cmd.status() {
        Ok(status) => exit(status.code().unwrap_or(0)),
        Err(e) => {
            eprintln!("[nexus-mcp-bridge] Failed to spawn node: {}", e);
            exit(1);
        }
    }
}
