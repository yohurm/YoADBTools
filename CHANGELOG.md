# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)；版本号即产品版本（Cargo workspace / Tauri / pnpm 单源一致）。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [0.1.4] - 2026-11-25

本次为 **补丁版本升级**：新增 Linux 平台正式交付与三端安装包，日志模块完成数据面重构（IPC 契约有变更，见「升级注意」）。

### 新增

- **Linux 工作台正式交付**：`cargo tauri build` 产出 `.deb`，WebKitGTK 4.1 + XDG 路径（`~/.local/opt` 安装根、`~/.local/share/YohuAdbTools` 产品家园），窗口标题/路径/关于页按 Linux 适配（ADR-v6-043）。
- **三端安装包与发布流水线**：Release 由 `vX.Y.Z` 标签触发，并行打包 Windows NSIS / macOS DMG / Linux deb，汇总生成多平台 `update-manifest.json` 挂到 GitHub Release（ADR-v6-045）。应用内检查更新优先读 `releases/latest/download/update-manifest.json`。
- **Linux 投屏出画**：有 H.264 VLD 时走 VA-API；没有硬解时用私有 OpenH264 软解画进已登记的 GTK 子窗口（ADR-v6-042）。OpenH264 二进制不进安装包，改为用户在设置里点「下载 OpenH264」从 Cisco 钉死版本单独获取并校验 SHA-256（ADR-v6-044）。
- **关于页**：安装根与「本次程序」分两行展示；发布仓库一栏改称「发布仓库」；OpenH264 提供点击下载入口。
- **日志缓冲与文档**：默认环形缓冲提升到 100000 行；日志窗口按环容量保住过滤后的文档；行号滚轴按本地文档换可见行。
- **文件管理**：同目录换名先问占用（`AlreadyExists` 不覆盖）；预览栏改走折叠的列向轴。
- **终端与 YoUI 细节**：命令管理行留白与菜单井对齐；容器洗对齐色彩表，菜单与下拉使用同一套特殊铬。

### 变更（架构与契约）

- **日志数据面视口化（ADR-v6-050，取代 049 的「UI 全量文档」）**：core 新增 `log.query(serial, filter, from_seq, to_seq, limit, direction)` 做过滤分页（forward/backward + `has_more`）；UI 每个窗口只持视口窗口（`WINDOW_MAX=2000`），滚动取页、实时增量 `catchUp`、换过滤从环尾重建。内存从 O(buffer_capacity × 窗口数) 降为 O(WINDOW_MAX × 窗口数)。删除 UI 全量文档与三份正文路径。
- **日志实时取数（ADR-v6-049）**：环形缓冲为唯一实时数据源；`log/hits` 退化为每设备水位信号 `log/appended{serial,last_seq}`（不含正文）；UI 用 `log.range` 按 seq 游标拉取。删除 `WindowBook` 命中索引、`Batcher` 正文聚合、`log.window.bind/release`、`LogOverflow`。
- **日志消费投影（ADR-v6-048）**：连续 seq 为文档唯一位置契约，新增 `stream/seq` 单一对账原语与空洞自愈；删除 `bumpPage/pageGen` 双代际。
- **日志状态机与单一数据源（ADR-v6-047）**：采集槽位 / 跟流 / 窗口索引 / 环容量状态机闭合，P0/P1 缺口清零。
- **日志解耦（ADR-v6-046）**：`yohu-logsrv` 拆 `CaptureSlots` / `RingStore` / `LogExporter` / `ProcessIndexService`，`CaptureService` 只组合转发；UI store 改单向切片分层；删死双轨 `AppEvent::LogBatch` / `log.replay`。
- **设置**：`clear_device_on_start` 默认恢复 `true`（启动前清设备缓冲，与既有行为一致）。

### 性能

- 环读取改为 O(1) 下标化；`StoredLine` 正文/时间戳 `Arc<str>` 化；`log.range` 改列式二进制 IPC；命中批量提交。
- `log.query` 真机压测：单设备尾窗/头页各 200 行约 7–8ms；3 设备并行各 200 行约 8–10ms。
- 修复实时拉取风暴导致的开发窗口卡死；修复向上分页前插时的视口锚点（`docShift` 负补偿）。

### 修复

- **Tag 含 `/` 时整条日志丢失、下一条时间戳卡在上一条尾部**：`parse::take_level_tag` 改用第一个 `/` 作级别/Tag 分隔（ADR-v6-046），`I/OkHttp/4.9.0` 一类合法头不再被吞。
- 带过滤的窗口不再把命中 seq 间隔误判为空洞。
- 日志任务账本原子化与错误分类单点；UI store 与编辑器按状态机解耦。
- Linux 投屏舞台铬与占用卡片对齐 Windows（按同一曲线插值、圆角层）。
- 文件列表失败进入 fault 相位；Linux 投屏绑定失败画进画面洞。
- NSIS 安装包嵌入资源管理器可显示的图标。
- 集成测试 fixture 的 `fake-adb` 定位改为在 workspace `target` 内按名字查找，兼容 Cargo 构建目录布局，三端 CI 的 Rust 测试恢复通过。
- macOS / Windows 不再编译 Linux 呈现档；三端 CI 按同一套事实编译；兼容 Rust 1.99 / TypeScript 5.9 与 Windows 换行。

### 测试

- 前端全量 Vitest **2858 通过**（1 项环境抖动，镜像单跑 40/40），`typecheck=0`，`lint` 通过。
- Rust `clippy` 0 警告；`yohu-logsrv` 94+13+6、`yohu-protocol` 59 通过。
- Linux 全模块功能核对清单（设备 / 终端 / 文件 / 日志 / 投屏 OpenH264 / 设置 / 更新 / 掉线）通过；未做项（拖出、VA-API 硬解、多设备）已记录。

### 升级注意

- **IPC 契约变化**：`log/hits`、`log.window.bind`、`log.window.release` 已移除；改用 `log/appended` 水位信号 + `log.query` / `log.range`。自建调用方需同步。
- **Linux 投屏**：首次使用前需在设置里下载 OpenH264（不打进 `.deb`）；没有它时画面洞会给出下载入口。
- **设置默认值**：`clear_device_on_start` 恢复默认 `true`。
- **macOS 安装包未签名**（无 Apple 证书），首次打开可能需在「隐私与安全性」里允许。

## 历史版本

- **0.1.3**（2026-10-09）：更新通道固定 GitHub Releases；Windows 安装包图标；事实收口与多选迁移。
- **0.1.2**（2026-09-23）：更新通道与版本号提升。
- **0.1.1**（2026-09-20）：首次纳入更新检查。
- **0.1.0**（2026-09-18）：v6 架构首个正式版（设备 / 终端 / 文件 / 日志 / 投屏 / 设置）。

[0.1.4]: https://github.com/yohurm/YoADBTools/compare/v0.1.3...v0.1.4
