use std::env;
use std::path::PathBuf;
use std::process::{exit, Command};

fn main() {
    let mut exe_path = env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    exe_path.pop(); // current directory: resources/bridge
    let bridge_js = exe_path.join("index.js");

    // Look for bundled runtime node.exe at ../runtime/node.exe
    let mut runtime_node = exe_path.clone();
    runtime_node.pop(); // resources/
    runtime_node.push("runtime");
    runtime_node.push("node.exe");

    let node_bin = if runtime_node.exists() {
        runtime_node
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
