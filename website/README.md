# Nexus Official Product Website

This directory contains the official website for **Nexus (Local AI Control Plane & Secure MCP Bridge)**.

- **GitHub Repository**: [https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT](https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT)

---

## 🌟 Highlights & Features
- **Design Aesthetic**: Minimalist, warm, and comfortable aesthetic (inspired by Apple, Linear, and Claude).
- **Dark/Light Mode**: Smooth toggle between warm paper-like light mode and gentle dark mode.
- **Bilingual Support**: Dynamic one-click toggle between English and 简体中文.
- **Interactive Simulated Workflow**: Live card preview showcasing `SAFE` auto-approvals and `CAUTION` approval consent cards.
- **Direct Downloads**: Pre-linked to the compiled `Nexus_1.2.0_x64-setup.exe` Windows installer.
- **Self-Contained**: Uses CDN-based Tailwind CSS & Lucide Icons — zero build steps required to preview!

---

## 🚀 How to Preview

### Option 1: Direct Browser Open
Double-click `website/index.html` to open it directly in Microsoft Edge, Google Chrome, or Safari.

### Option 2: Local HTTP Server
Run any lightweight static server:
```bash
# Using Node / npx
npx serve website

# Or using Python
python -m http.server 8080 --directory website
```
Then visit `http://localhost:8080`.

---

## 🌐 Deployment to GitHub Pages / Vercel
- **GitHub Pages**: Set GitHub Pages source to `/website` or `/docs`.
- **Vercel / Cloudflare Pages**: Set root directory to `website`.
