# Yohu ADB Tools

<p align="center">
  <img src="app/yohu-adbtools/icons/128x128.png" alt="Yohu ADB Tools" width="96" height="96">
</p>

<p align="center">
  <strong>设备工具工作台</strong> — 基于 ADB 的多模块桌面平台，面向产测与调试。
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20x64%20%7C%20macOS%20%7C%20Linux-lightgrey.svg" alt="Platform">
  <img src="https://img.shields.io/badge/Rust-stable-orange.svg" alt="Rust">
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB.svg" alt="Tauri 2">
</p>

Yohu ADB Tools（产品名 `YohuAdbTools`）把设备扫描、命令终端、文件管理、日志分析和投屏显示收进同一个工作台。核心用 Rust，窗口与 IPC 走 Tauri 2，界面是 TypeScript + SolidJS 与自研组件库 YoUI。

当前版本 **0.1.3**。交付 **Windows 10/11 x64**、**macOS 12+** 与 **Linux**（x64 / arm64，WebKitGTK 4.1）。投屏像素与文件拖出在 Linux 上仍是预留能力。

## 功能

| 模块 | 做什么 |
|------|--------|
| **设备管理** | `adb devices -l` 扫描（在线 / 未授权 / 离线 + 型号）；夜览、电量、SDK、亮屏由统一状态采样；手动刷新 + 可选 2 秒自动刷新 |
| **命令终端** | 命令库与命令组、多设备并行、组内串行；占位符 `{0}{1}`；统一输入/输出块；命令管理窗口深拷贝编辑、保存全量提交 |
| **文件管理** | 浏览、上传/下载（可取消）、删除、新建；路径由 core 侧安全根强制校验（`/sdcard`、`/storage`，拒绝 `..`） |
| **日志分析** | 每设备一路 logcat；多窗口 Tab（按包名 / PID）；级别、Tag、关键字过滤；暂停与滚动挂起；导出 txt |
| **投屏显示** | 官方 scrcpy-server 4.1 + 自写客户端；系统硬解呈现（Windows Media Foundation / macOS VideoToolbox）。Linux 预留 VA-API，启动投屏会得到明确的未实现错误，不用 FFmpeg 填 |
| **设置与更新** | ADB 路径、主题、密度、缓冲容量等；Windows 可应用内下载 NSIS 覆盖安装；macOS 打开 DMG；Linux 打开 `.deb` |

## 技术栈

```text
UI（SolidJS / YoUI） → @yohu/api → IPC ← Tauri 壳 ← Rust core
```

- **Rust**（tokio）：进程、协议、命令库、ADB 运输、logcat、文件、投屏、更新
- **Tauri 2**：窗口、sidecar、IPC（invoke 命令 + 批量事件）
- **TypeScript + SolidJS + Vite**：工作台壳与四个功能模块
- **ADB / scrcpy-server**：官方 platform-tools 与 Genymobile scrcpy-server 4.1 作为 sidecar，不重实现 ADB 协议

## 开发

需要 [Rust stable](https://rustup.rs/)、[Node.js 24](https://nodejs.org/) 与 [pnpm 10+](https://pnpm.io/)。

### 准备 sidecar

二进制不入库。第一次构建前先拉官方 adb 与 scrcpy-server：

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File scripts/setup-adb.ps1
powershell -ExecutionPolicy Bypass -File scripts/setup-scrcpy-server.ps1
```

```bash
# macOS
bash scripts/setup-adb.sh
bash scripts/setup-scrcpy-server.sh
```

```bash
# Linux（Debian / Ubuntu）
bash scripts/setup-linux-deps.sh   # WebKitGTK 4.1、GTK3、patchelf、xdg-utils
bash scripts/setup-adb.sh
bash scripts/setup-scrcpy-server.sh
```

`setup-linux-deps.sh` 走 `apt-get`。其它发行版请自行安装同一组库：`libwebkit2gtk-4.1-dev`、`libgtk-3-dev`、`libayatana-appindicator3-dev`、`librsvg2-dev`、`patchelf`、`libssl-dev`、`libxdo-dev`、`pkg-config`、`build-essential`、`xdg-utils`。

USB 设备节点权限不在安装包里。Debian/Ubuntu 可装一次 udev 规则（需要管理员），然后重新登录：

```bash
sudo apt install android-sdk-platform-tools-common
sudo usermod -aG plugdev "$USER"
```

### 依赖与检查

```bash
pnpm -C ui install

cargo build --workspace
cargo test --workspace
cargo clippy --all-targets -- -D warnings

pnpm -C ui typecheck
pnpm -C ui test
pnpm -C ui build
```

### 运行与打包

```bash
cargo tauri dev     # Windows WebView2 / macOS WKWebView / Linux WebKitGTK + 前端开发服务器
cargo tauri build   # Windows NSIS；macOS .app / .dmg；Linux .deb
```

在 `app/yohu-adbtools` 下执行 `cargo tauri`。Linux 的 `.deb` 依赖系统 WebKitGTK 4.1，不把浏览器打进包里。需要 AppImage 时再跑 `cargo tauri build --bundles appimage`（首次会下载 linuxdeploy）。

Windows 安装包走 per-user NSIS，并内嵌 WebView2 引导。ADB 作为 sidecar 打进安装包，运行时解压到产品数据目录；解压后会补上 Unix 可执行位。sidecar 不在时，Linux 再按 `ANDROID_HOME`、`ANDROID_SDK_ROOT`、`~/Android/Sdk/platform-tools` 和 `PATH` 找可执行的 `adb`。

### Linux 路径

| 用途 | 位置 |
|------|------|
| 产品家园 | `$XDG_DATA_HOME/YohuAdbTools`，未设置时为 `~/.local/share/YohuAdbTools`（其下 `config/` `data/` `cache/` `logs/`） |
| per-user 安装根 | `~/.local/opt/YohuAdbTools` |
| `.deb` 主程序 | `/usr/bin/YohuAdbTools`（关于页的安装根仍是上面的 per-user 约定，不跟随当前进程路径） |

打开目录和下载好的 `.deb` 使用 `xdg-open`。文件拖出、投屏出画在 Linux 上还没有：拖出返回「仅支持 Windows 与 macOS」，投屏后端 id 是 `vaapi` 且不会出像素。

## 文档

| 文档 | 内容 |
|------|------|
| [需求分析](docs/requirements/需求分析.md) | 产品定位与量化成功标准 |
| [架构](docs/architecture/README.md) | 分层、IPC、模块、ADR |
| [YoUI](docs/architecture/youi.md) | 组件库约定 |
| [工作台](docs/architecture/workbench.md) | 壳、设备栏、模块注册 |

## 许可

本仓库以 [MIT License](LICENSE) 开源。版权归属 Yohu。

运行时会下载或随安装包分发第三方二进制，它们各自保留原许可：

- [Android platform-tools](https://developer.android.com/tools/releases/platform-tools)（官方 `adb`）
- [scrcpy-server 4.1](https://github.com/Genymobile/scrcpy)（Apache-2.0）
