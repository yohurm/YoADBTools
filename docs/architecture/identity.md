# 产品身份与命名单源

> 常量在 `yohu-protocol`（`PRODUCT_NAME` / `DISPLAY_NAME` / `IDENTIFIER` / `DESCRIPTION` / `COPYRIGHT` / `DATA_DIR_NAME` / `module_id::*` / `module_title::*` / `dir::*`）。  
> 版本号 = Cargo workspace `version`（`CARGO_PKG_VERSION`）；`tauri.conf.json` 由 `yohu-adbtools/build.rs` 校验一致。UI 禁止再写死版本号或展示名。

## 命名

| 用途 | 取值 |
|------|------|
| 产品 / NSIS `productName` / 主程序 | `YohuAdbTools` |
| 窗口标题 / 状态栏 / 关于 | `Yohu ADB Tools` |
| 包标识 | `com.yohu.adbtools` |
| 产品家园 | Windows `%LOCALAPPDATA%\YohuAdbTools\`；macOS `~/Library/Application Support/YohuAdbTools\`（`yohu-runtime::app_data_root`） |
| 安装根 | Windows `%LOCALAPPDATA%\Programs\YohuAdbTools\`；macOS `/Applications/YohuAdbTools.app`（`yohu-runtime::app_install_root`） |
| Tauri 壳 crate | **`yohu-adbtools`**（`app/yohu-adbtools`；唯一引用 Tauri） |
| 原生动效 crate | **`yohu-motion`**（`core/yohu-motion`；与 runtime / protocol 并列，零 Tauri、零产品 HWND） |
| 前端工作台包 | **`@yohu/workbench`**（`ui/packages/workbench`） |
| 组件库对外名 | **YoUI**；npm 包仍 `@yohu/ui` |
| IPC 门面 | `@yohu/api` |
| 模块 | `@yohu/module-{terminal,files,logs,mirror}` |
| 模块导航 / 页眉 | `module_title::*`（命令终端 / 文件管理 / 日志分析 / 投屏显示 / 设置）；目录 id 仍是 `module_id::*`（`adb-terminal` 等，不随展示名改） |
| 图标 | `app/yohu-adbtools/icons/`；UI 同源 `/app-icon.png` |

`system.info` 返回 `{ identity, paths, adb_path, settings }`。`adb_path` 是 ToolResolver 当前解析的那一份运行时 sidecar（用户设置或 DataRoot 解压副本）。

## 路径规划

安装根与产品家园分离（ADR-v6-031）。Windows per-user 载荷在 `Programs\`，可变文件在家园。改 `data_root` 不搬家。

```text
<os_app_data>/Programs/<DATA_DIR_NAME>/   # 安装根（Windows）；macOS = /Applications/<name>.app
<os_app_data>/<DATA_DIR_NAME>/            # 产品家园（不随 data_root 迁移）
├── config/settings.json
├── config/devices-catalog.json           # 上次成功 `devices -l`
├── config/update.json                    # 更新通道覆盖（ADR-v6-022）
├── logs/                                 # app-*.log + panic-*.log
├── cache/webview/                        # WebView2 用户数据
├── cache/update/                         # NSIS / DMG 下载缓存
├── cache/drag-out/                       # 拖出临时区（启动/退出整清）
└── data/                                 # DataRoot（可配，重启生效）
    ├── tools/adb/                        # 解压 sidecar + .sidecar-stamp
    └── modules/
        ├── adb-terminal/config/library.json
        └── log-analyzer/exports/         # 懒创建
```

产品子路径由壳 `AppPaths` 用 `dir::*` 拼装；OS 根只经 `app_data_root` / `app_install_root`。
