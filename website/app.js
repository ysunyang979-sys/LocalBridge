document.addEventListener("DOMContentLoaded", () => {
  // 1. OS Detection & Dynamic Hero Button
  const userAgent = window.navigator.userAgent.toLowerCase();
  const heroDownloadBtn = document.getElementById("hero-download-btn");
  const heroDownloadText = document.getElementById("hero-download-text");
  const macCard = document.getElementById("card-mac");
  const winCard = document.getElementById("card-win");
  const linuxCard = document.getElementById("card-linux");

  let detectedOS = "other";

  if (userAgent.includes("mac") || userAgent.includes("darwin")) {
    detectedOS = "mac";
    if (macCard) {
      macCard.classList.add("recommended");
      winCard?.classList.remove("recommended");
    }
    if (heroDownloadText) {
      heroDownloadText.textContent = "下载 macOS 版 (Apple Silicon .dmg)";
    }
    if (heroDownloadBtn) {
      heroDownloadBtn.href = "../releases/Nexus_1.2.0_aarch64.dmg";
    }
  } else if (userAgent.includes("win")) {
    detectedOS = "win";
    if (winCard) {
      winCard.classList.add("recommended");
      macCard?.classList.remove("recommended");
    }
    if (heroDownloadText) {
      heroDownloadText.textContent = "下载 Windows 版 (.exe 安装包)";
    }
    if (heroDownloadBtn) {
      heroDownloadBtn.href = "../releases/Nexus_1.2.0_x64-setup.exe";
    }
  } else if (userAgent.includes("linux")) {
    detectedOS = "linux";
    if (linuxCard) {
      linuxCard.classList.add("recommended");
      winCard?.classList.remove("recommended");
      macCard?.classList.remove("recommended");
    }
    if (heroDownloadText) {
      heroDownloadText.textContent = "下载 Linux 版 (.AppImage 便携版)";
    }
    if (heroDownloadBtn) {
      heroDownloadBtn.href = "../releases/Nexus_1.2.0_amd64.AppImage";
    }
  }

  // 2. Toast Notification Helper
  const toast = document.getElementById("toast");
  const toastMsg = document.getElementById("toast-msg");
  let toastTimer = null;

  function showToast(message) {
    if (!toast || !toastMsg) return;
    toastMsg.textContent = message;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2800);
  }

  // 3. Checksum Copy Buttons
  document.querySelectorAll(".btn-copy-hash").forEach((btn) => {
    btn.addEventListener("click", () => {
      const hash = btn.getAttribute("data-hash");
      if (hash) {
        navigator.clipboard.writeText(hash).then(() => {
          showToast("已成功复制 SHA-256 校验和到剪贴板！");
        }).catch(() => {
          showToast("复制失败，请手动选取复制");
        });
      }
    });
  });

  // 4. Linux "Coming Soon" Alert Button
  const btnLinuxNotify = document.getElementById("btn-linux-notify");
  if (btnLinuxNotify) {
    btnLinuxNotify.addEventListener("click", (e) => {
      e.preventDefault();
      showToast("🐧 Linux 版本 (.deb / AppImage) 正在做最后的沙箱兼容测试，即将推出！欢迎 Star GitHub 仓库获取第一波更新。");
    });
  }

  // 5. Config Tabs Switcher
  const tabBtns = document.querySelectorAll(".tab-btn");
  const codeDisplay = document.getElementById("code-display");
  const btnCopyCode = document.getElementById("btn-copy-code");

  const configSnippets = {
    chatgpt: `{
  "name": "Nexus LocalBridge",
  "endpoint": "http://127.0.0.1:18080/mcp",
  "auth": {
    "type": "bearer",
    "token": "lb_your_generated_client_token"
  },
  "capabilities": [
    "file_system_sandbox",
    "git_operations",
    "code_intelligence_lsp",
    "background_job_execution"
  ]
}`,
    claude: `{
  "mcpServers": {
    "nexus": {
      "url": "http://127.0.0.1:18080/mcp",
      "headers": {
        "Authorization": "Bearer lb_你的令牌内容",
        "MCP-Protocol-Version": "2026-07-28"
      }
    }
  }
}`,
    cursor: `{
  "mcp": {
    "servers": [
      {
        "id": "nexus-control-plane",
        "transport": "sse",
        "url": "http://127.0.0.1:18080/mcp",
        "authToken": "lb_你的令牌内容"
      }
    ]
  }
}`
  };

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.getAttribute("data-tab");
      if (codeDisplay && configSnippets[target]) {
        codeDisplay.textContent = configSnippets[target];
      }
    });
  });

  if (btnCopyCode) {
    btnCopyCode.addEventListener("click", () => {
      if (codeDisplay) {
        navigator.clipboard.writeText(codeDisplay.textContent).then(() => {
          showToast("已成功复制 MCP 配置代码！");
        });
      }
    });
  }

  // 6. FAQ Accordion Toggle
  document.querySelectorAll(".faq-question").forEach((item) => {
    item.addEventListener("click", () => {
      const parent = item.parentElement;
      const isOpen = parent.classList.contains("open");
      document.querySelectorAll(".faq-item").forEach((f) => f.classList.remove("open"));
      if (!isOpen) {
        parent.classList.add("open");
      }
    });
  });

  // 7. Terminal Mockup Log Animation Effect
  const termLogs = document.getElementById("mockup-live-logs");
  if (termLogs) {
    const liveMessages = [
      { prefix: "[15:04:12]", tag: "[MCP-GATE]", text: "Request: localbridge_file_read -> Canonical Path Verified OK", cls: "log-cyan" },
      { prefix: "[15:04:13]", tag: "[POLICY]", text: "Execution Risk Evaluation: SAFE (read-only in sandbox)", cls: "log-success" },
      { prefix: "[15:04:15]", tag: "[RUNNER]", text: "Streamed 4.2 KB buffer to ChatGPT tunnel safely", cls: "log-purple" },
      { prefix: "[15:04:18]", tag: "[AUDIT]", text: "Sensitive files (.env, private keys) auto-filtered: 0 leaked", cls: "log-cyan" }
    ];
    let msgIdx = 0;
    setInterval(() => {
      const msg = liveMessages[msgIdx % liveMessages.length];
      const div = document.createElement("div");
      div.className = "log-line";
      div.innerHTML = `<span class="log-prefix">${msg.prefix}</span> <span class="${msg.cls}">${msg.tag}</span> ${msg.text}`;
      termLogs.appendChild(div);
      if (termLogs.children.length > 5) {
        termLogs.removeChild(termLogs.children[0]);
      }
      msgIdx++;
    }, 3500);
  }
});
