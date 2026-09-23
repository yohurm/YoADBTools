# IPC 协议

事件名 `/` 分层（ADR-v6-020，Tauri 2.9 禁止点号）；invoke **命令名**仍点分。常量：`yohu-protocol::event_names` ↔ `@yohu/api` `EVENT_NAMES`。

错误：各 crate 自有 Error → 壳映射 `IpcError { code, message }`。不设统一 `YohuError`。

## invoke

| 命令 | 说明 |
|------|------|
| `device.list` | 读目录快照，不跑 adb |
| `device.refresh` | `start-server` + `devices -l` 整表替换目录并立刻推 `devices/changed`；与启动预热单飞；先前 Online 且本次不再 Online 的 serial 推 `device/offline`，浏览同一拍关当前槽；采集/投屏后台收敛；Online 集合同步 `DeviceStatusHub`（先 getprop 再 dumpsys） |
| `device.status` | 读运行时状态缓存（可选 `serial`）；不触发扫描 |
| `device.setNightMode` | 写连接设备深浅色，返回更新后的 `DeviceStatus` 并推 `device/status` |
| `adb.exec` | 短命令 |
| `terminal.eval` / `terminal.exec` / `block.run` / `group.run` / `group.cancel` | `eval` 按库 id 填充执行（UI 不用）；`exec` 发送命令行；`block.run` 跑组下同级命令块（步间按块级间隔）；组编排；取消兼取消块 |
| `commandlib.load` / `save` | 命令库 schemaVersion 3 only；缺文件写默认库；损坏或其他 schema 则备份后写默认库 |
| `files.session.attach` / `files.session.detach` | 浏览能力会话（ADR-v6-033）。`attach(serial)` 返回 `BrowseAttach { serial, generation, adopted }`（Empty→Starting→Live 或 adopt）。Ok = 该世代在槽位提交时已发布 Live，不保证稍后观察时仍 Live。握手 `Unsupported`（无 `-T` 或 非 sh / 从未打印 `__YOHU_SHELL_READY__`）才记 oneshot；Timeout / Cancelled / DeviceOffline 不记 oneshot。IPC `detach(serial, generation)` 走 `browse_runs::release`：世代不符空操作（不关槽、不 replace 取消在途 list，不得杀掉更新 Live）；命中才关槽并取消在途 list。UI 持有 `BrowseAttach.generation`。视图卸载 / `bindSerial(null)` 带所持世代 detach。掉线不是 IPC：壳 `went_offline` 里 `browse_runs.replace` + `FileBrowser.detach(serial)` 与 replace 同一拍强制关当时槽，不得把无世代 detach 接在采集 join 之后。改 `adb.path`：`drop_workers`、槽位仍 Live、世代不变 |
| `files.list` / `push` / `pull` / `cancel` / `delete` / `mkdir` / `create` / `dragOut` | 安全根在 core。`list(serial, path, generation)`：无槽 / Closed → `NotAttached`；世代不符 → `Cancelled`；Starting 同世代等待；Live 同世代才 list。永不偷偷 attach。设备侧 `ls`/`rm`/`push` 失败由 `yohu-files::file_error_from_adb` 分类为 `RemoteNotFound` / `NotADirectory` / `PermissionDenied` 等；未分类 BadExit → `RemoteFailed(path)`，不带 stderr。`FileError` 不 `From<AdbError>`。拖出树触顶 `TreeLimit(项)` / `TreeDepth(层)` fail-closed，禁止当成功截断。壳 `ipc_file`：远端不存在 → `not_found`，本地不存在与其余路径类（含 `TreeLimit` / `TreeDepth` / `NotAttached`）→ `invalid_args`，`Adb`（含 `Cancelled`）→ `ipc_adb`。禁止把 `执行失败(退出码 n): ls: ...` 原文交给 UI；UI 禁止再扫 stderr |
| `log.capture.start/stop/status` | 仅 Live adopt；generation |
| `log.clear` / `log.clearDevice` / `log.replay` / `log.processSnapshot` / `log.packageSnapshot` | 环 / logcat -c / 回补 / ps / 已安装包名 |
| `log.export` | 当前窗口过滤条件下的环快照（ADR-v6-021） |
| `mirror.start/stop/inject/closeControl/present.setActive/layout/pointer/screenshot` | 投屏槽位；画面在壳内 Present（ADR-v6-024/026/027）。`mirror.start` 只传 `serial/control/connection/session_quality_touched`。**舞台开关** `mirror.present.setActive` 只由 `@yohu/workbench` 在模块身份变化时调用（离开 `screen-mirror` 同一拍 `false` 并拆 HWND）。`mirror.layout` 为相对主窗客户区的物理矩形：**.yohu-mirror__avail 格子**。另带会话旗标 `dpr/fullscreen/paused/control/has_device/failed/error/dark`。`dark` 跟工作台 `data-theme`。未激活时一切 layout（含 `visible=true`）丢弃。禁止 `video_width` / `stroke_px` / layout `epoch`。HWND 按 FramePipe 编码尺寸 contain 并画占用卡片，idle 铺满 avail。`mirror.pointer` 与 layout 同一坐标系，UI 不算 dest。Live 状态只信 `mirror/state`，无 `mirror.status` |
| `settings.set` | 更新单键；推 `settings/changed` 全量快照。读走 `system.info` / 事件注入 |
| `system.info` / `openPath` / `reportError` / `log` | 关于 / 打开路径 / 上报。`paths` 含 `install_dir` / `config_dir` / `cache_dir` / `webview_dir` / `update_cache_dir`（ADR-v6-031；无 `settings_dir`） |
| `boot.showMain` | 揭窗**唯一入口**。`commands/boot` 薄转发 `window_boot::show_if_hidden`。工作台已 hydrate：Windows 上同屏铺满后再揭主窗内容 / 异屏出场后再揭；其它平台直接揭窗。幂等。禁止超时双轨。 |
| `update.check` / `info` / `download` / `install` / `cancel` / `open` | ADR-v6-022 |

本机选路走 `@yohu/api` 的 `dialogOpen*` / `dialogSaveFile`（封装 `tauri-plugin-dialog`）。窗口三键走 `@yohu/api` 的 `windowMinimize` 等（封装 `@tauri-apps/api/window`）；启动是原生小窗（Win32 GDI，进程入口）→ 主窗 hydrate → `windowShow`（`boot.showMain`）按同屏/异屏交接。工作台不直连 Tauri。`mirror.present.setActive` 由工作台调用；`mirror.layout.dark` 跟工作台 `data-theme`；设备夜览只走月亮钮 / `deviceStatuses.night`。

## `@yohu/api` 门面

薄 IPC：类型、invoke 转发、`listen` 原样转发。禁止几何换算、禁止把 string/object 嗅成同一错误、禁止用延时重试顶启动时序。

### 设计前（invoke / 事件，已废除）

```text
invoke 失败
  → JS unknown（字符串 ∥ {message} ∥ JSON.stringify）
  → error.ts 双形态嗅探 → 文案

core AppEvent ──emit──► Tauri
  → events.ts listen<unknown>
  → asRecord(object|JSON 字符串)、空负载 return、补 kind
  → 调用方

wry tauri://drag-* 物理点（Physical ∥ {x,y}）
  → events.ts cssPointFromPhysical(devicePixelRatio)
  → NativeDragDropEvent CSS 点
  → FileView elementFromPoint

listen 失败
  → 40×250ms 退避（约 10s）顶「IPC 还没好」
  → 耗尽才 reject；拖放再额外 catch 重试一次
```

问题：门面夹带换算与容错；Physical∥CSS、错误双形态、kind 补丁都是兼容层；延时重试掩盖真实启动顺序。

### 设计后

```text
各 crate Error → 壳 IpcError {code,message} → invoke reject
  → error.ts 一次解码 IpcError
  → errorText / ipcErrorCode

core AppEvent ──emit──► Tauri（负载已是 AppEvent）
  → events.ts listen<AppEvent> 原样 handler(payload)
  → 工作台 / 模块 store

wry WindowEvent::DragDrop 物理点（主窗 WindowContent）
  → Tauri 官方 tauri://drag-enter|over|drop|leave
  → @yohu/api onNativeDragDrop（getCurrentWebview().onDragDropEvent；handler(payload) 原样；禁止几何换算）
  → FileView DropSession（enter 即热）
  → files dest：cssPointFromPhysical(position, scale) 只细化目录

App onMount bindIpc()（listen 已可用）→ 各 store 订阅
  listen 失败立即 reject，禁止 api 重试
```

不做什么：不保留 Physical∥CSS 双轨；不在 api 补 kind / 吞空负载；不把 `commandBlockGapLabel` 放进 api（展示文案在 `@yohu/module-terminal`）。`DeviceSession` 在 `session.ts`，不是 wire。`system.log` 失败不得空 catch。`formatLogTs` 解析失败给空串，不回脏原文。

## 事件

| 事件 | 节流 |
|------|------|
| `devices/changed` / `device/offline` | 扫描 / 掉线即发（offline 必达） |
| `device/status` | 运行时快照内容变化才发（可丢）；对账走 `device.status` |
| `log/lines` | 100–200ms / 1000 行 / 512KB；可丢推送 |
| `log/processIndex` | 2.5s |
| `log/captureState` | 必达 |
| `log/overflow` | 丢批计数 |
| `transfer/progress` | Running 200ms 可丢；终态必达 |
| `group/progress` / `task/summary` | 命令/任务；`TaskInfo.run_id` 仅组/块 |
| `settings/changed` | 必达；带全量快照 |
| `mirror/state` | 必达 |
| `mirror/painted` | 首帧必达；之后 1s 窗口 fps |
| `update/progress` | 下载 200ms 可丢；阶段切换必达 |
| 官方 `tauri://drag-*` | 框架把 wry 拖放发给 webview；不是 AppEvent；`@yohu/api` `onNativeDragDrop` 原样转发。禁止几何换算。换算只在 files dest。禁止自造 `window/drag` |

## 背压

RingBuffer seq 单调；Batcher 有界 mpsc 满则丢**推送**不丢环；UI 经 overflow + `log.replay` 补镜像。

**导出：** `log.export` 读环（`seq >= from_seq` + domain 过滤），仅用户操作落盘。replay 读环不过滤。

**投屏帧：** 不进 JS。`yohu-mirror::FramePipe` 有界 8 帧，sticky 最后一份 config（先丢 delta，不丢 config）；**呈现线程 `try_recv` 直取**，禁止再泵进无界通道。满则丢待发帧，不影响设备 TCP。`mirror.start` 只传 `serial/control/connection/session_quality_touched`。

### 设计后（commands 薄转发）

```text
invoke update.check/info/download/install/cancel/open → commands/update → update_runs
invoke files.session.attach → commands/files require_online → browse_runs → FileBrowser.attach → UI 持有 BrowseAttach.generation
invoke files.list(serial, path, generation) → commands/files require_online → browse_runs → FileBrowser.list（无槽/Closed→NotAttached；世代不符→Cancelled；Starting 同世代等待；Live 同世代 list；永不 attach；DeviceShell.exec 或 oneshot）→ file_error_from_adb → ipc_file
invoke files.session.detach(serial, generation) → browse_runs::release（世代不符空操作：不关槽、不 replace 取消在途 list；命中才关槽并取消在途 list；视图卸载带所持世代）
went_offline（壳目录，非 IPC）→ browse_runs.replace + FileBrowser.detach(serial) 与 replace 同一拍强制关当时槽，不得把无世代 detach 接在采集 join 之后
invoke files.push/pull/cancel → commands/files → transfer_runs::spawn / run
invoke files.dragOut → commands/files → dnd → list_tree（TreeLimit / TreeDepth fail-closed → ipc_file）→ 成功才 transfer_runs::run
invoke files.delete/mkdir/create → commands/files → mutator（超时在 mutate.rs）→ file_error_from_adb → ipc_file
invoke mirror.start → commands/mirror → mirror_sessions（present.attach 只绑管道）
invoke log.capture.start → commands/log → capture_runs
invoke log.export → commands/log → capture_runs::export（默认目录策略）
invoke settings.set → commands/settings → settings_apply
invoke boot.showMain → commands/boot → window_boot::show_if_hidden
```

`PresentHost::attach` 未 active 不 `ensure_surface`。建窗只走 `setActive(true)` + `layout`。
