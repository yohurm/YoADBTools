# 工作台壳（`@yohu/workbench` + `apps/shell`）

Rust 壳是 `yohu-adbtools`。前端工作台包是 **`@yohu/workbench`**（不再叫 `@yohu/app`，以免与产品/crate 撞名）。

`apps/shell` 是**唯一组合点**：`registerModule(descriptor)`。模块只依赖 `@yohu/api` + `@yohu/ui`；禁止依赖 `@yohu/workbench`、禁止模块互引（`scripts/check-ui-deps.mjs`）。

## 模块契约

```typescript
interface ModuleDescriptor {
  id: string;              // module_id::*
  title: string;           // module_title::*
  icon: IconName;
  selectionMode: "none" | "singleRequired" | "multiOptional";
  kind?: "workspace" | "system";
  isPlanned?: boolean;
  Component: Component<DeviceSession>;
  Status?: Component;      // 状态栏右槽；无内容时不输出节点
}
```

壳注入 `DeviceSession`（焦点、执行目标、设备目录、**运行时状态**、设置快照）。模块不读壳 store、不自拼页眉设备名、不轮询设备 dumpsys。设置只读注入快照（启动 `system.info`，变更 `settings/changed`）。模块 store 在模块内部创建（不经 descriptor `createStore`）。

## 数据链

```text
adb devices -l → device_catalog.last_devices（唯一目录）
  写：device.refresh / 启动预热 / 自动刷新
  读：device.list、devices/changed、require_online
Online serial → yohu-adb::DeviceStatusHub（唯一运行时状态）
  写：2s 采样 / device.setNightMode
  读：device.status、device/status
DeviceRail → deviceStore（目录 + statuses 投影）→ resolve_targets → DeviceSession
settings.json → settings.set / settings/changed → settingsStore → DeviceSession.settings
```

成功扫描（含空列表）整表替换目录。扫描失败不改目录。禁止用上次快照顶替空扫描。启动可读 `devices-catalog.json` 先画卡片，再被本次扫描替换。目录事件在 `devices -l` 后立刻发；运行时字段经 `device/status` 分段到达。预热与 UI refresh 共用一趟 adb。

选择策略在 domain 与 TS 各有一份，testdata JSON 对齐（点击不能等 IPC）。

壳层只认 View → store → `@yohu/api` → commands → domain。View 不 `dialogOpen*` / `systemOpenPath` / `mirror.present.setActive` / 窗口三键 / `boot.showMain`。

### 设计前（越级）

```text
启动：App.onMount → runBootPipeline → windowShow；揭失败 catch 后仍当成功，refresh 继续
切模块：AppLayout 信号 → ModuleStage 直调 mirrorPresentSetActive
选择：DeviceRail → deviceStore.selectDevice（已在 store）
设置：SettingsView 自调 dialogOpen* / systemOpenPath / Number.parseInt 吞非法值
      SettingsView.onMount 再 settingsStore.load（与启动重复）
      进入设置 refresh update.info → channel，空 catch；关于页不读
路径铬：SettingsView 自绘 .yohu-settings__path（复制 YoTextField 皮）
```

### 设计后

```text
启动：register.ts 登记设置页
      App 只组合 → boot.runBootPipeline
        load: settingsStore.load + deviceStore.load（各一次；失败记日志不抛）
        boot 只 await load，无死 catch；load 上抛则停止揭窗
        双 rAF → windowShow（失败上抛，不 refresh）
          → invoke boot.showMain（揭窗唯一入口）
        返回后 deviceStore.refresh
扫描失败：device.refresh 失败
        lastError = 主错误（errorText）
        store 再打 system.info 拼「；adb: 路径」/「；adb 未解析」
        system.info 失败：YoLog.warn + errorText，lastError 仍是主错误
        DeviceRail 只展示 lastError，不拼 hint
切模块：NavList 事件 → navStore.navigate
        ModuleStage 身份变化同一拍 → navStore.setMirrorPresent(id)
          → mirror.present.setActive（只认 ModuleId.Mirror；进投屏立刻建表面，不跟淡出）
        进出投屏同一拍挂载/卸载 MirrorView，不跟 YoPresence 淡出；其它模块仍 fade
选择：DeviceRail 事件 → deviceStore.selectDevice → DeviceSession
设置：SettingsForm 事件 → settingsStore.set / browseAdbPath / browseDataRoot / browseExportPath / openLogsDir
        整段十进制整数字符串 → JSON number；非法串原样
        → settings.set → domain apply_setting → 失败 toast
        设置页不 load；关于页不展示通道，不 refresh / channel
检查更新：SettingsForm → updateStore.check → update.check
        installer_url → 应用内下载；page_url → update.open
路径铬：PathChrome = YoTextField readOnly + YoButton（槽宽 settings-control-max）
窗口铬：AppLayout → windowStore（minimize / toggleMaximize / close / 最大化快照）
侧栏：AppLayout 用户意图 `data-rail`；`YoRail` 宽度拍 + `data-stream` 文案流（常驻双态，不是抽屉）
        轨 width / 槽 0fr / 卡高 / 字流同一拍 spatialRail
        DeviceRail / NavList 读 `useRail()` / `YoRailSlot`；图标轨可点
```

## 启动链路

同窗启动层已改为 **原生小窗 → 主窗**（Android Studio / IntelliJ SplashManager / keyhop Win32 GDI；禁止第二 WebView splash，见 tauri#1850）：

1. 进程入口立刻画 480×300 无边框原生小窗（GDI，图标 + 展示名）。原生启动画布出口是 `window_boot::canvas_color` / `canvas_bgra`，对齐 `--yohu-bg-base`。`SplashPlacement` 锁定几何 + dark + `corner`（`Radius.Md` × DPI）。绘制写入矩形 `BootFrame`（不透明 BGRA，四角即画布色）；`SetWindowRgn` 只裁显示外形，椭圆直径 = `corner * 2`，并 `DWMWCP_DONOTROUND`（RGN + DWM 圆角会叠出黑角）。`BootSurface` 由 placement + frame 锁定，overlay fill / brand / clip 只读这一份。同屏 clip 终点是 0，不是 `host_radius`。`prepare_main_window` 的 System 探针跟 `boot_dark()`，禁止再采 `win.theme()`。默认落在**主屏**工作区居中，不跟光标屏。Tauri 是 Per-Monitor V2，GDI 不会自动缩放：尺寸用主屏 `GetDpiForMonitor` 做 `MulDiv(logical, dpi, 96)`。禁止 `dpi/96` 整数截断，禁止 `SM_CXSCREEN`（虚拟屏宽）。**不等** WebView2。
2. 主窗 `visible: false` 创建并加载工作台。Windows 禁止 `center: true`（Tao 自持坐标，揭 `show` 会写回，跟光标屏）。创建后与揭窗前都用小窗锁定的主屏工作区 `set_position`。HTML `#yohu-boot` 只铺画布色盖住隐藏中的 hydrate，用户看不见，也不再画 Logo。

### HTML 首帧画布（隐藏 WebView）

**设计前：** `index.html` 内联 `html[data-theme="dark"] body/#root/#yohu-boot { background: #000000 }`。特异性高于 `theme.css` 的 `html, body, #root { background-color: var(--yohu-canvas) }`，且 `background` 缩写会盖掉 `background-color`。深色走 OLED 纯黑，与 `DarkColors.BgBase` / `window_boot::CANVAS_DARK`（`#191A1C`）第二轨。`boot-theme.js` 空 `catch` 吞掉 `matchMedia`。Vite `port: 1420` 与 `tauri.conf.json` `devUrl` 各写一次。`#yohu-boot` `z-index: 2000` 无契约。

**设计后：**

```
boot-theme.js（无 catch）
  → documentElement data-theme + color-scheme（prefers-color-scheme）
index.html 内联（theme.css 尚未入场）
  → background-color: var(--yohu-canvas, Colors.BgBase | DarkColors.BgBase)
theme.css（defer 到 </body>）
  → --yohu-canvas = var(--yohu-bg-base)；html/body/#root 铺 token
原生小窗 / window_boot::CANVAS_* / --yohu-bg-base
  → 用户可见画布单源（#F1F3F5 / #191A1C）
Vite server.port
  → 解析 tauri.conf.json build.devUrl（禁止再写 1420 字面量）
#yohu-boot z-index
  → 2000，boot.test.ts 锁死且 > ZIndex.Toast
```

禁止 HTML 选择器用裸色值当终态。fallback 只在 `--yohu-canvas` 未定义时生效；变量一旦存在，再特异的 `html[data-theme="dark"] …` 也必须消费 token。禁止空 `catch`。禁止把启动编排塞进 `main.tsx`。

3. `App` `onMount` 先 `deviceStore` / `taskStore` / `updateStore.bindIpc()`（`listen` 已可用；设置变更在 `createSettingsStore` 订 `settings/changed`）再 `settingsStore.load` + `deviceStore.load`（各一次）→ 拆掉 HTML 层 → 双 rAF → `windowShow`（`boot.showMain`）。**隐藏文档没有合成帧**，`waitForNextPaint` 不得再等 `requestAnimationFrame`（否则揭窗永不发生）。揭失败上抛，不 `refresh`。壳在 **工作台已画好之后** 才交接，禁止边 hydrate 边播动画。禁止 `@yohu/api` 用延时重试顶订阅时序。
   页面 Finished 且 URL 是 `chrome-error` / `chromewebdata` 时，原生失败出口 `show_if_hidden(page-failed)`，关掉启动小窗；这是导航失败，不是 2.5s 超时双轨。`devUrl` 的 Vite 挂掉会走这条。`about:blank` 与应用页不算失败。
4. 交接分类（小窗矩形 vs 隐藏主窗矩形是否落在小窗锁定的工作区）：
   - **同屏**：主窗一次落到最终外框（仍隐藏）。Shared overlay 盖住后再藏小窗；fill morph 铺满、clip 半径从 splash `Radius.Md` **收到 0** 之后才 `ShowWindow` 主窗，再 100ms 淡出 overlay。铺满 = 目标 HWND 每个像素都是不透明画布；`host_radius`（`Radius.Sm`）是主窗 DWM 圆角，揭窗后才属于主窗，不进 overlay clip。fill 2×2 与 brand 都来自 `BootSurface`（canvas token + paint `BootFrame`）。overlay HWND `DWMWCP_DONOTROUND` + 整窗 `DwmExtendFrameIntoClientArea`。禁止从 HWND DC 抓像素，禁止把 RGB=0 补成画布。禁止在 morph 期间让工作台从透明区透出。禁止 `SetWindowPos` 插值小窗/主窗尺寸。
   - **异屏**：主窗一次落到小窗锁定的工作区（仍隐藏）。Exit overlay 出场结束后才揭主窗。禁止跨屏共享几何、禁止主窗 HWND 放大。视线留在小窗那块屏。
   - 系统 `SPI_GETCLIENTAREAANIMATION` 关闭时瞬时揭窗。
   - 时长 / 曲线 / 消息泵 / `IDCompositionAnimation` 采样只走 `yohu-motion`。overlay HWND 与配方留在 `native_splash`。禁止 `yohu-motion` 持画布色，禁止引用投屏。投屏 `stage_palette` 是另一条 surface 链，不进本链路。
5. `device.refresh` 在 `boot.showMain` **返回后**（动画已结束）发起，与 core 预热单飞。
6. Media Foundation HEVC 探测后置。禁止壳 2.5s / 50ms 超时双轨，禁止 handover 防双播标志位。成功揭窗只走 hydrate → 双 rAF → `boot.showMain`。导航失败（错误页 URL）走 `page-failed`，不是超时。

## Tauri 壳（`app/yohu-adbtools`）

薄命令层：反序列化 → `require_online` → 壳服务 / core。编排在 `device_catalog` / `library_store` / `group_runs` / `update_runs` / `transfer_runs` / `browse_runs` / `mirror_sessions` / `settings_apply` / `capture_runs`。设备运行时状态在 `yohu-adb::DeviceStatusHub`（[modules/device.md](modules/device.md)，ADR-v6-025）。Windows 启动 overlay 在 `native_splash`（窗口 / swapchain / DComp 三分文件）；时长与 DComp 采样只消费 `yohu-motion`。几何只留 `native_splash/geometry.rs`，不从 `yohu-motion` 重导出 `xywh`。`dnd/`：Windows OLE 拖出、macOS Finder 拖出（[文件拖拽-v6.md](文件拖拽-v6.md)）。退出：根 `CancellationToken` → 3s 强杀进程树 → flush 设置。

### 设计后（启动交接 / IPC / 投屏 HWND）

```text
工作台 hydrate → 双 rAF → invoke boot.showMain
  → commands/boot 薄转发
  → window_boot::show_if_hidden
  → native_splash::to_main（无 STATE）
  → recipe 同屏/异屏 → overlay 窗口 + swapchain + DComp → 揭 HWND

invoke mirror.start → commands/mirror → mirror_sessions::start
  → MirrorService.start → present.attach（只 stash / BindPipe，未 active 不建窗）
invoke mirror.present.setActive(true) + mirror.layout
  → PresentHost::layout → ensure_surface 建 HWND
  → occupancy DComp clip contain

invoke files.session.attach → commands/files require_online → browse_runs::attach
  → FileBrowser.attach（Empty→Starting→Live 或 adopt；BrowseAttach { serial, generation, adopted }；ADR-v6-033）
  → attach Ok 表示该世代在槽位提交时已发布 Live；不表示稍后一次 IPC 观察时槽位仍 Live。
  → 握手 `Unsupported`（无 `-T` 或 非 sh / 从未打印 `__YOHU_SHELL_READY__`）才记 oneshot；Timeout / Cancelled / DeviceOffline 不记 oneshot。
  → UI 持有 generation
invoke files.list(serial, path, generation) → commands/files require_online → browse_runs::list
  → files.list(serial, path, generation)：无槽 / Closed → NotAttached；世代不符 → Cancelled；Starting 且同世代则等待；Live 且同世代才 list。后一次取消前一次。永不在 list 里偷偷 attach。SafetyRoot + DeviceShell.exec / oneshot
invoke files.session.detach(serial, generation) 走 browse_runs::release：世代不符空操作（不关槽、不 replace 取消在途 list，不得杀掉更新 Live）；命中才关槽并取消在途 list。视图卸载带所持世代
went_offline（壳目录，不是 IPC）：browse_runs.replace + FileBrowser.detach(serial) 与 replace 同一拍强制关当时槽，不得把无世代 detach 接在采集 join 之后。
invoke files.push/pull → transfer_runs::spawn（tokio::spawn(run)；立即返回 id）
invoke files.dragOut → dnd → files.dragOut / FileBrowser.list_tree(serial, remotes, generation)携带 BrowseAttach.generation；禁止 peek 槽位世代。→ transfer_runs::run（Win block_on / mac await）
invoke log.export → commands/log 转发 → capture_runs::export
  → 空 export_default_path 用 paths.exports_dir，否则设置目录
  → CaptureService.export（环快照 + domain 过滤）
invoke log.capture.start → capture_runs::start
invoke settings.set → settings_apply::set
invoke update.check/info → commands/update → update_runs
invoke update.download/install → update_runs（installed_exe_path 必须 Result）
```

## UI 组合

- DeviceRail：`YoListItem` + `YoStatusDot` + `YoScroller` + `YoEmptyState`。list 宿主只 `overflow: hidden`。禁止 `__scroller` 包装。
- NavList：`YoListItem` + `YoScroller`。
- AppLayout：侧栏 `YoRail`。页眉设备名走 `selectedDeviceLabel` → `DeviceSession.selectedLabel` → 模块 `YoChrome.leading` + `YoBadge`。禁止 `YoChrome deviceLabel`。
- Settings：`YoPage role=settings`（page-margin + settings-max 居中阅读列）；页眉第一子节点；页面级一根 `YoScroller`。卡片 `YoPanel overflow=visible`，禁止再套 scroller，禁止页面再铺一套页垫。
- UpdateDialogs：`YoDialog` children 各一根 `YoScroller`。
- PathChrome：`YoTextField width=control` 只读 + `YoButton`。禁止 `block` 套 hug 簇。
- 壳 CSS 禁止 `overflow: auto` / `scroll` 双轴产品条。
