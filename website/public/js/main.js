// Theme Switcher & Code Copy Handler
document.addEventListener("DOMContentLoaded", function () {
  // Theme Toggle
  const toggleBtn = document.getElementById("themeToggle");
  const htmlEl = document.documentElement;

  const savedTheme = localStorage.getItem("nexus_blog_theme");
  if (savedTheme) {
    htmlEl.setAttribute("data-theme", savedTheme);
  } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    htmlEl.setAttribute("data-theme", "dark");
  }

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const current = htmlEl.getAttribute("data-theme") === "dark" ? "light" : "dark";
      htmlEl.setAttribute("data-theme", current);
      localStorage.setItem("nexus_blog_theme", current);
      updateIcon();
    });
  }

  function updateIcon() {
    if (!toggleBtn) return;
    const isDark = htmlEl.getAttribute("data-theme") === "dark";
    toggleBtn.textContent = isDark ? "☀️" : "🌙";
  }
  updateIcon();

  // Code Copy Buttons
  document.querySelectorAll(".article-content pre").forEach((block) => {
    const button = document.createElement("button");
    button.className = "copy-code-btn";
    button.textContent = "Copy";
    button.style.position = "absolute";
    button.style.top = "8px";
    button.style.right = "8px";
    button.style.fontSize = "11px";
    button.style.padding = "2px 8px";
    button.style.borderRadius = "4px";
    button.style.border = "1px solid var(--border)";
    button.style.background = "var(--tag-bg)";
    button.style.color = "var(--text-muted)";
    button.style.cursor = "pointer";

    button.addEventListener("click", () => {
      const code = block.querySelector("code") || block;
      navigator.clipboard.writeText(code.innerText.trim()).then(() => {
        button.textContent = "Copied!";
        button.style.color = "var(--accent)";
        setTimeout(() => {
          button.textContent = "Copy";
          button.style.color = "var(--text-muted)";
        }, 1800);
      });
    });

    block.style.position = "relative";
    block.appendChild(button);
  });
});
