# 工作台壳（`@yohu/workbench` + `apps/shell`）

Rust 壳是 `yohu-adbtools`。前端工作台包是 **`@yohu/workbench`**（不再叫 `@yohu/app`，以免与产品/crate 撞名）。

`apps/shell` 是**唯一组合点**：`registerModule(descriptor)`。模块只依赖 `@yohu/api` + `@yohu/ui`；禁止依赖 `@yohu/workbench`、禁止模块互引（`scripts/check-ui-deps.mjs`）。

## 模块契约

```typescript
interface ModuleDescriptor {
  id: string;              // module_id::*
  title: string;
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

## 启动链路

同窗启动层已改为 **原生小窗 → 主窗**（Android Studio / IntelliJ SplashManager / keyhop Win32 GDI；禁止第二 WebView splash，见 tauri#1850）：

1. 进程入口立刻画 480×300 无边框原生小窗（GDI，图标 + 展示名，画布色对齐 `--yohu-bg-base`）。Tauri 是 Per-Monitor V2，GDI 不会自动缩放：尺寸用光标所在屏 `GetDpiForMonitor` 做 `MulDiv(logical, dpi, 96)`，再在该屏工作区居中。禁止 `dpi/96` 整数截断，禁止主屏 `SM_CXSCREEN`。**不等** WebView2。
2. 主窗 `visible: false` 创建并加载工作台；HTML `#yohu-boot` 只铺画布色盖住隐藏中的 hydrate，用户看不见，也不再画 Logo。
3. `settingsStore.load` + `deviceStore.load` 完成后拆掉 HTML 层，再 `windowShow`（`boot.showMain`）揭主窗：主窗跟小窗用同一块工作区居中，并关掉原生小窗。
4. `device.refresh` 在揭主窗后发起，与 core 预热单飞。
5. 2.5s 超时仍兜底揭主窗，避免 JS 失败导致只剩小窗。Media Foundation HEVC 探测后置。

## Tauri 壳（`app/yohu-adbtools`）

薄命令层：反序列化 → core → 序列化。编排在 `device_catalog` / `library_store` / `group_runs`。设备运行时状态在 `yohu-adb::DeviceStatusHub`（[modules/device.md](modules/device.md)，ADR-v6-025）。`dnd/`：Windows OLE 拖出、macOS Finder 拖出（[文件拖拽-v6.md](文件拖拽-v6.md)）。退出：根 `CancellationToken` → 3s 强杀进程树 → flush 设置。
