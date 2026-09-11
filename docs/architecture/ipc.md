# IPC 协议

事件名 `/` 分层（ADR-v6-020，Tauri 2.9 禁止点号）；invoke **命令名**仍点分。常量：`yohu-protocol::event_names` ↔ `@yohu/api` `EVENT_NAMES`。

错误：各 crate 自有 Error → 壳映射 `IpcError { code, message }`。不设统一 `YohuError`。

## invoke

| 命令 | 说明 |
|------|------|
| `device.list` | 读目录快照，不跑 adb |
| `device.refresh` | `start-server` + `devices -l` 整表替换目录并立刻推 `devices/changed`；与启动预热单飞；先前 Online 且本次不再 Online 的 serial 推 `device/offline`，采集/投屏后台收敛；Online 集合同步 `DeviceStatusHub`（先 getprop 再 dumpsys） |
| `device.status` | 读运行时状态缓存（可选 `serial`）；不触发扫描 |
| `device.setNightMode` | 写连接设备深浅色，返回更新后的 `DeviceStatus` 并推 `device/status` |
| `adb.exec` | 短命令 |
| `terminal.eval` / `terminal.exec` / `block.run` / `group.run` / `group.cancel` | `eval` 按库 id 填充执行（UI 不用）；`exec` 发送命令行；`block.run` 跑组下同级命令块（步间按块级间隔）；组编排；取消兼取消块 |
| `commandlib.load` / `save` | 命令库；损坏备份后默认库 |
| `files.list` / `push` / `pull` / `cancel` / `delete` / `mkdir` / `create` / `dragOut` | 安全根在 core。设备侧 `ls`/`rm` 等失败由 `yohu-files` 分类为 `RemoteNotFound` / `NotADirectory` / `PermissionDenied` 等，壳 `ipc_file`：不存在 → `not_found`，其余路径类 → `invalid_args`。禁止把 `执行失败(退出码 n): ls: ...` 原文交给 UI |
| `log.capture.start/stop/status` | 仅 Live adopt；generation |
| `log.clear` / `log.clearDevice` / `log.replay` / `log.processSnapshot` / `log.packageSnapshot` | 环 / logcat -c / 回补 / ps / 已安装包名 |
| `log.export` | 当前窗口过滤条件下的环快照（ADR-v6-021） |
| `mirror.start/stop/inject/closeControl/present.setActive/layout/screenshot` | 投屏槽位；画面在壳内 Present（ADR-v6-024/026/027）。`mirror.start` 只传 `serial/control/connection/session_quality_touched`。**舞台开关** `mirror.present.setActive` 只由 `@yohu/workbench` 在模块身份变化时调用（离开 `screen-mirror` 同一拍 `false` 并拆 HWND）。`mirror.layout` 为相对主窗客户区的物理矩形：**.yohu-mirror__avail 格子**。另带会话旗标 `dpr/fullscreen/paused/control/has_device/failed/error/dark`。`dark` 跟工作台 `data-theme`。未激活时一切 layout（含 `visible=true`）丢弃。禁止 `video_width` / `stroke_px` / layout `epoch`。HWND 按 FramePipe 编码尺寸 contain 并画占用卡片，idle 铺满 avail。Live 状态只信 `mirror/state`，无 `mirror.status` |
| `settings.set` | 更新单键；推 `settings/changed` 全量快照。读走 `system.info` / 事件注入 |
| `system.info` / `openPath` / `reportError` / `log` | 关于 / 打开路径 / 上报。`paths` 含 `install_dir` / `config_dir` / `cache_dir` / `webview_dir` / `update_cache_dir`（ADR-v6-031；无 `settings_dir`） |
| `boot.showMain` | 工作台已 hydrate：Windows 上同屏铺满后再揭主窗内容 / 异屏出场后再揭；其它平台直接揭窗。幂等。 |
| `update.check` / `info` / `download` / `install` / `cancel` / `open` | ADR-v6-022 |

本机选路走 `@yohu/api` 的 `dialogOpen*` / `dialogSaveFile`（封装 `tauri-plugin-dialog`）。窗口三键走 `@yohu/api` 的 `windowMinimize` 等（封装 `@tauri-apps/api/window`）；启动是原生小窗（Win32 GDI，进程入口）→ 主窗 hydrate → `windowShow`（`boot.showMain`）按同屏/异屏交接。工作台不直连 Tauri。`mirror.present.setActive` 由工作台调用；`mirror.layout.dark` 跟工作台 `data-theme`；设备夜览只走月亮钮 / `deviceStatuses.night`。

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
| `group/progress` / `task/summary` | 命令/任务 |
| `settings/changed` | 必达；带全量快照 |
| `mirror/state` | 必达 |
| `mirror/painted` | 首帧必达；之后 1s 窗口 fps |
| `update/progress` | 下载 200ms 可丢；阶段切换必达 |

## 背压

RingBuffer seq 单调；Batcher 有界 mpsc 满则丢**推送**不丢环；UI 经 overflow + `log.replay` 补镜像。

**导出：** `log.export` 读环（`seq >= from_seq` + domain 过滤），仅用户操作落盘。replay 读环不过滤。

**投屏帧：** 不进 JS。`yohu-mirror::FramePipe` 有界 8 帧，sticky 最后一份 config（先丢 delta，不丢 config）；**呈现线程 `try_recv` 直取**，禁止再泵进无界通道。满则丢待发帧，不影响设备 TCP。`mirror.start` 只传 `serial/control/connection/session_quality_touched`。
