/**
 * 壳组件测试（Phase C，UI设计系统-v6.md §3/§4.4）：
 * DeviceRail 卡片语义/键盘选择、NavList 键盘导航、StatusBar 任务明细、
 * SettingsView 生效徽章/浏览/密度切换/toast。
 * @yohu/api 全量 mock（device/task/update 在 App onMount bindIpc）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import type { Component } from "solid-js";

const mocks = vi.hoisted(() => ({
  deviceList: vi.fn(),
  deviceRefresh: vi.fn(),
  deviceStatus: vi.fn(),
  systemInfo: vi.fn(),
  settingsSet: vi.fn(),
  systemOpenPath: vi.fn(),
  dialogOpenFile: vi.fn(),
  dialogOpenDirectory: vi.fn(),
  dialogSaveFile: vi.fn(),
  updateCheck: vi.fn(),
  updateInfo: vi.fn(),
  updateOpen: vi.fn(),
  updateDownload: vi.fn(),
  updateInstall: vi.fn(),
  updateCancel: vi.fn(),
  windowShow: vi.fn(async () => undefined),
  mirrorPresentSetActive: vi.fn(async (..._args: unknown[]) => undefined),
  taskHandler: null as null | ((e: unknown) => void),
}));

vi.mock("@yohu/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@yohu/api")>();
  const noop = (): void => undefined;
  const notConfigured = vi.fn(async () => {
    throw new Error("测试未配置该命令 mock");
  });
  return {
    ...actual,
    deviceList: (...a: unknown[]) => mocks.deviceList(...a),
    deviceRefresh: (...a: unknown[]) => mocks.deviceRefresh(...a),
    deviceStatus: (...a: unknown[]) => mocks.deviceStatus(...a),
    systemInfo: (...a: unknown[]) => mocks.systemInfo(...a),
    settingsSet: (...a: unknown[]) => mocks.settingsSet(...a),
    systemReportError: noop,
    systemOpenPath: (...a: unknown[]) => mocks.systemOpenPath(...a),
    dialogOpenFile: (...a: unknown[]) => mocks.dialogOpenFile(...a),
    dialogOpenDirectory: (...a: unknown[]) => mocks.dialogOpenDirectory(...a),
    dialogSaveFile: (...a: unknown[]) => mocks.dialogSaveFile(...a),
    updateCheck: (...a: unknown[]) => mocks.updateCheck(...a),
    updateInfo: (...a: unknown[]) => mocks.updateInfo(...a),
    updateOpen: (...a: unknown[]) => mocks.updateOpen(...a),
    updateDownload: (...a: unknown[]) => mocks.updateDownload(...a),
    updateInstall: (...a: unknown[]) => mocks.updateInstall(...a),
    updateCancel: (...a: unknown[]) => mocks.updateCancel(...a),
    onUpdateProgress: noop,
    adbExec: notConfigured,
    terminalEval: notConfigured,
    groupRun: notConfigured,
    groupCancel: notConfigured,
    commandlibLoad: notConfigured,
    commandlibSave: notConfigured,
    filesList: notConfigured,
    filesPush: notConfigured,
    filesPull: notConfigured,
    filesCancel: notConfigured,
    filesDelete: notConfigured,
    filesMkdir: notConfigured,
    filesDragOut: notConfigured,
    filesCreate: notConfigured,
    logCaptureStart: notConfigured,
    logCaptureStop: notConfigured,
    logCaptureStatus: notConfigured,
    logClear: notConfigured,
    logClearDevice: notConfigured,
    logReplay: notConfigured,
    logExport: notConfigured,
    logProcessSnapshot: notConfigured,
    logPackageSnapshot: notConfigured,
    onDevicesChanged: noop,
    onDeviceOffline: noop,
    onDeviceStatus: noop,
    onLogBatch: noop,
    onLogOverflow: noop,
    onProcessIndex: noop,
    onCaptureState: noop,
    onTransferProgress: noop,
    onNativeDragDrop: (): Promise<() => void> => Promise.resolve(() => undefined),
    onGroupProgress: noop,
    onSettingsChanged: noop,
    onTaskSummary: (h: (e: unknown) => void): void => {
      mocks.taskHandler = h;
    },
    mirrorPresentSetActive: (...a: unknown[]) => mocks.mirrorPresentSetActive(...a),
    mirrorLayout: vi.fn(async () => undefined),
    windowMinimize: vi.fn(async () => undefined),
    windowToggleMaximize: vi.fn(async () => undefined),
    windowClose: vi.fn(async () => undefined),
    windowIsMaximized: vi.fn(async () => false),
    windowShow: () => mocks.windowShow(),
    listenWindowResize: vi.fn(async () => () => undefined),
    EVENT_NAMES: {
      devicesChanged: "devices/changed",
      deviceOffline: "device/offline",
      logLines: "log/lines",
      logOverflow: "log/overflow",
      processIndex: "log/processIndex",
      captureState: "log/captureState",
      transferProgress: "transfer/progress",
      groupProgress: "group/progress",
      taskSummary: "task/summary",
      settingsChanged: "settings/changed",
    },
  };
});

import { DeviceRail } from "./DeviceRail";
import { NavList } from "./NavList";
import { StatusBar } from "./StatusBar";
import { AppLayout } from "./AppLayout";
import { SettingsView } from "../settings/SettingsView";
import { App } from "../App";
import { resetMainWindowRevealForTests } from "../boot";
import { registerModule } from "../registry";
import { deviceStore, navStore, settingsStore, taskStore, updateStore } from "../stores";
import { APP_IDENTITY, APP_SETTINGS_DEFAULT, ModuleId, ModuleTitle, type DeviceSession } from "@yohu/api";
import { Layout } from "@yohu/ui";

/** 探测壳注入的页眉设备名；用于断言切设备不依赖切模块。 */
const SessionProbe: Component<DeviceSession> = (props) => (
  <div data-testid="session-probe">{props.selectedLabel ?? ""}</div>
);

// 真实应用在 apps/shell 入口注册；测试注册一份子集（含 Planned 模块）。
registerModule({
  id: ModuleId.Terminal,
  title: ModuleTitle.Terminal,
  icon: "terminal",
  selectionMode: "multiOptional",
  Component: SessionProbe,
});
registerModule({
  id: ModuleId.Files,
  title: ModuleTitle.Files,
  icon: "folder",
  selectionMode: "singleRequired",
  Component: SessionProbe,
});
// Settings 由 register.ts 在 App import 时登记，测试不再重复登记。
registerModule({
  id: ModuleId.Mirror,
  title: ModuleTitle.Mirror,
  icon: "mirror",
  selectionMode: "singleRequired",
  Component: () => <div data-testid="mirror-stage">mirror</div>,
  Status: () => <span>12 fps</span>,
});
registerModule({
  id: "planned-demo",
  title: "占位模块",
  icon: "list",
  selectionMode: "none",
  isPlanned: true,
  Component: () => null,
});

const DEFAULT_SETTINGS = { ...APP_SETTINGS_DEFAULT, theme: "light" as const };

const RESOLVED_ADB = "C:\\Users\\me\\AppData\\Local\\YohuAdbTools\\data\\tools\\adb\\adb.exe";
const RESOLVED_LOCAL = "C:\\Users\\me\\AppData\\Local\\YohuAdbTools";
const RESOLVED_DATA = "C:\\Users\\me\\AppData\\Local\\YohuAdbTools\\data";
const RESOLVED_EXPORT = "C:\\Users\\me\\AppData\\Local\\YohuAdbTools\\data\\modules\\log-analyzer\\exports";
const RESOLVED_PATHS = {
  local_root: RESOLVED_LOCAL,
  install_dir: "C:\\Users\\me\\AppData\\Local\\Programs\\YohuAdbTools",
  config_dir: `${RESOLVED_LOCAL}\\config`,
  settings_file: `${RESOLVED_LOCAL}\\config\\settings.json`,
  logs_dir: `${RESOLVED_LOCAL}\\logs`,
  data_root: RESOLVED_DATA,
  cache_dir: `${RESOLVED_LOCAL}\\cache`,
  webview_dir: `${RESOLVED_LOCAL}\\cache\\webview`,
  update_cache_dir: `${RESOLVED_LOCAL}\\cache\\update`,
  adb_tools_dir: `${RESOLVED_DATA}\\tools\\adb`,
  library_file: `${RESOLVED_DATA}\\modules\\adb-terminal\\config\\library.json`,
  exports_dir: RESOLVED_EXPORT,
  drag_out_dir: `${RESOLVED_LOCAL}\\cache\\drag-out`,
};

const DEFAULT_IDENTITY = {
  ...APP_IDENTITY,
  version: "0.1.0",
};

beforeEach(() => {
  mocks.systemInfo.mockResolvedValue({
    identity: { ...DEFAULT_IDENTITY },
    paths: { ...RESOLVED_PATHS },
    adb_path: RESOLVED_ADB,
    settings: { ...DEFAULT_SETTINGS },
    os: "windows",
  });
  mocks.settingsSet.mockImplementation(async (key: string, value: unknown) => {
    return { ...DEFAULT_SETTINGS, [key]: value };
  });
  mocks.deviceList.mockResolvedValue([]);
  mocks.deviceRefresh.mockResolvedValue([]);
  mocks.deviceStatus.mockResolvedValue([]);
  mocks.dialogOpenFile.mockResolvedValue(null);
  mocks.dialogOpenDirectory.mockResolvedValue(null);
  mocks.dialogSaveFile.mockResolvedValue(null);
  mocks.systemOpenPath.mockResolvedValue(undefined);
  mocks.updateInfo.mockResolvedValue({
    remote: "yohurm/Windows-YoADBTools",
    page_url: "https://github.com/yohurm/Windows-YoADBTools",
  });
  mocks.updateCheck.mockResolvedValue({
    has_new_version: false,
    version: "0.1.0",
    description: "",
    installer_url: null,
    page_url: "https://github.com/yohurm/Windows-YoADBTools",
    sha256: "",
    size_bytes: 0,
  });
  mocks.updateOpen.mockResolvedValue(undefined);
  mocks.updateDownload.mockResolvedValue({ path: "C:\\Temp\\YohuAdbTools-update\\setup.exe", size_bytes: 10 });
  mocks.updateInstall.mockResolvedValue(undefined);
  mocks.updateCancel.mockResolvedValue(undefined);
});

afterEach(() => {
  updateStore.dismiss();
  navStore.navigate(ModuleId.Terminal);
  resetMainWindowRevealForTests();
  mocks.windowShow.mockClear();
  mocks.mirrorPresentSetActive.mockClear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-density");
});

describe("DeviceRail（§3 设备卡片）", () => {
  it("卡片渲染型号/串号/未授权徽章；在线首台自动获焦（listbox 语义）", async () => {
    mocks.deviceRefresh.mockResolvedValue([
      { serial: "A1", model: "Moto X", state: "online", connection: "usb" },
      { serial: "B2", state: "unauthorized", connection: "usb" },
    ]);
    await deviceStore.refresh();
    const { container } = render(() => <DeviceRail />);
    expect(screen.getByText("Moto X")).toBeTruthy();
    expect(screen.getByText("A1")).toBeTruthy();
    expect(screen.getByText("未授权")).toBeTruthy();
    const items = container.querySelectorAll('[role="option"]');
    expect(items.length).toBe(2);
    expect(items[0]?.getAttribute("aria-selected")).toBe("true");
    expect(items[0]?.getAttribute("tabindex")).toBe("0");
    expect(items[1]?.getAttribute("tabindex")).toBe("-1");
    expect(container.querySelector(".yohu-device-rail__list")?.getAttribute("role")).toBe("listbox");
    expect(container.querySelector(".yohu-scroller")).toBeTruthy();
    expect(container.querySelector(".yohu-device-rail")?.hasAttribute("data-rail")).toBe(false);
    expect(container.querySelector(".yohu-device-rail")?.getAttribute("data-stream")).toBe("open");
    const header = container.querySelector(".yohu-device-rail__header") as HTMLElement;
    const headerKids = Array.from(header.children);
    expect(within(header).getByText("设备")).toBeTruthy();
    expect(header.querySelector(".yohu-badge")?.textContent).toBe("2");
    expect(within(header).getByRole("button", { name: "刷新设备" })).toBeTruthy();
    expect(headerKids[0]?.classList.contains("yohu-rail-slot")).toBe(true);
    expect(container.querySelector(".yohu-device-rail__scroller")).toBeNull();
    expect(container.querySelector(".yohu-scroller")).toBeTruthy();
    expect(items[0]?.classList.contains("yohu-interactive--selected")).toBe(true);
    expect(items[0]?.classList.contains("yohu-list-item")).toBe(true);
    expect(items[0]?.classList.contains("yohu-device-rail__item--active")).toBe(false);
    expect(items[0]?.getAttribute("title")).toBeNull();
    expect(items[0]?.getAttribute("aria-label")).toBe("Moto X");
  });

  it("点击与 Enter 键切换焦点设备（roving tabindex 跟随）", async () => {
    mocks.deviceRefresh.mockResolvedValue([
      { serial: "A1", model: "Moto X", state: "online", connection: "usb" },
      { serial: "B2", model: "Moto Y", state: "online", connection: "usb" },
    ]);
    await deviceStore.refresh();
    const { container } = render(() => <DeviceRail />);
    const items = Array.from(container.querySelectorAll('[role="option"]'));
    fireEvent.click(items[1] as HTMLElement);
    await Promise.resolve();
    expect(deviceStore.state.focusSerial).toBe("B2");
    expect(items[1]?.getAttribute("aria-selected")).toBe("true");
    expect(items[1]?.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(items[0] as HTMLElement, { key: "Enter" });
    await Promise.resolve();
    expect(deviceStore.state.focusSerial).toBe("A1");
  });

  it("空态：错误明细与重试按钮（诊断文案直接可见）", async () => {
    mocks.deviceRefresh.mockResolvedValueOnce([]); // 先清空单例 store 残留
    await deviceStore.refresh();
    mocks.deviceRefresh.mockRejectedValue({ code: "adb_error", message: "adb 未找到" });
    await deviceStore.refresh();
    const { container } = render(() => <DeviceRail />);
    expect(screen.getByText("无设备")).toBeTruthy();
    expect(deviceStore.state.lastError).toBe(`adb 未找到；adb: ${RESOLVED_ADB}`);
    expect(container.querySelector(".yohu-empty-state")?.textContent).toContain(
      `adb 未找到；adb: ${RESOLVED_ADB}`,
    );
    expect(screen.getByText("重试扫描")).toBeTruthy();
    expect(container.querySelector(".yohu-device-rail")?.getAttribute("data-empty")).toBe("true");
    expect(container.querySelector(".yohu-empty-state")?.getAttribute("data-size")).toBe("sm");
    expect(container.querySelector(".yohu-collapse")?.getAttribute("data-recipe")).toBe("collapse");
  });

  it("扫描空列表即无设备，不保留上次在线", async () => {
    mocks.deviceRefresh.mockResolvedValue([
      { serial: "A1", model: "Moto X", state: "online", connection: "usb" },
    ]);
    await deviceStore.refresh();
    expect(deviceStore.state.statusText).toBe("在线 1 台");
    mocks.deviceRefresh.mockResolvedValue([]);
    await deviceStore.refresh();
    expect(deviceStore.state.devices).toHaveLength(0);
    expect(deviceStore.state.statusText).toBe("无在线设备");
    expect(deviceStore.state.focusSerial).toBeNull();
    const { container } = render(() => <DeviceRail />);
    expect(screen.getByText("无设备")).toBeTruthy();
    expect(screen.getByText("连接设备并授权后刷新")).toBeTruthy();
    expect(screen.queryByText("重试扫描")).toBeNull();
    expect(container.querySelectorAll('[role="option"]').length).toBe(0);
    expect(container.querySelector(".yohu-device-rail")?.getAttribute("data-empty")).toBe("true");
  });

  it("刷新后用 device.status 对账运行时次行（不依赖可丢的 device/status 事件）", async () => {
    mocks.deviceRefresh.mockResolvedValue([
      { serial: "A1", model: "Moto X", state: "online", connection: "usb" },
    ]);
    mocks.deviceStatus.mockResolvedValue([
      { serial: "A1", generation: 1, release: "15", battery_pct: 87, charging: true },
    ]);
    await deviceStore.refresh();
    expect(deviceStore.state.statuses.A1?.battery_pct).toBe(87);
    render(() => <DeviceRail />);
    expect(screen.getByText("Android 15 · 87% 充电")).toBeTruthy();
    expect(document.querySelector('[role="option"]')?.getAttribute("aria-label")).toBe("Moto X");
  });

  it("两台在线时执行目标仅为焦点，不广播全部在线设备", async () => {
    mocks.deviceRefresh.mockResolvedValue([]);
    await deviceStore.refresh();
    mocks.deviceRefresh.mockResolvedValue([
      { serial: "A1", model: "Moto X", state: "online", connection: "usb" },
      { serial: "B2", model: "Moto Y", state: "online", connection: "usb" },
    ]);
    await deviceStore.refresh();
    const { container } = render(() => (
      <DeviceRail moduleId={ModuleId.Terminal} selectionMode="multiOptional" />
    ));
    expect(deviceStore.state.focusSerial).toBe("A1");
    expect(deviceStore.selectedSerials(ModuleId.Terminal, "multiOptional")).toEqual(["A1"]);
    expect(deviceStore.selectedDevices(ModuleId.Terminal, "multiOptional").map((d) => d.model)).toEqual([
      "Moto X",
    ]);
    expect(container.querySelector(".yohu-device-rail__list")?.getAttribute("aria-multiselectable")).toBe(
      "true",
    );
    const items = Array.from(container.querySelectorAll('[role="option"]'));
    fireEvent.click(items[1] as HTMLElement);
    await Promise.resolve();
    expect(deviceStore.state.focusSerial).toBe("B2");
    expect(deviceStore.selectedSerials(ModuleId.Terminal, "multiOptional")).toEqual(["B2"]);
    expect(items[0]?.getAttribute("aria-selected")).toBe("false");
    expect(items[1]?.getAttribute("aria-selected")).toBe("true");
  });

  it("Ctrl+click 在 MultiOptional 下累加选择", async () => {
    mocks.deviceRefresh.mockResolvedValue([]);
    await deviceStore.refresh();
    mocks.deviceRefresh.mockResolvedValue([
      { serial: "A1", model: "Moto X", state: "online", connection: "usb" },
      { serial: "B2", model: "Moto Y", state: "online", connection: "usb" },
    ]);
    await deviceStore.refresh();
    const { container } = render(() => (
      <DeviceRail moduleId={ModuleId.Terminal} selectionMode="multiOptional" />
    ));
    const items = Array.from(container.querySelectorAll('[role="option"]'));
    fireEvent.click(items[0] as HTMLElement);
    fireEvent.click(items[1] as HTMLElement, { ctrlKey: true });
    await Promise.resolve();
    expect(deviceStore.selectedSerials(ModuleId.Terminal, "multiOptional")).toEqual(["A1", "B2"]);
    expect(deviceStore.selectedDevices(ModuleId.Terminal, "multiOptional").map((d) => d.model)).toEqual([
      "Moto X",
      "Moto Y",
    ]);
    expect(items[0]?.getAttribute("aria-selected")).toBe("true");
    expect(items[1]?.getAttribute("aria-selected")).toBe("true");
  });

  it("列表宿主裁切滑块、滚动在 scroller，禁止 overflow:auto 双轴", () => {
    const candidates = [
      resolve(process.cwd(), "src/shell/shell.css"),
      resolve(process.cwd(), "packages/workbench/src/shell/shell.css"),
    ];
    const css =
      candidates.map((path) => (existsSync(path) ? readFileSync(path, "utf-8") : "")).find(Boolean) ?? "";
    const decls = (block: string): string =>
      (css.match(new RegExp(`^\\.${block}\\s*\\{([^}]*)\\}`, "m"))?.[1] ?? "").replace(
        /\/\*[\s\S]*?\*\//g,
        "",
      );
    expect(decls("yohu-device-rail__list")).toMatch(/overflow:\s*hidden/);
    expect(decls("yohu-device-rail__list")).not.toMatch(/overflow:\s*auto/);
    expect(css).not.toContain(".yohu-device-rail__scroller");
    expect(css).not.toContain(".yohu-device-rail__fold");
    expect(css).not.toMatch(/overflow:\s*auto/);
    expect(decls("yohu-device-rail")).toMatch(/max-height:\s*var\(--yohu-layout-device-rail-max\)/);
    expect(css).toMatch(
      /\.yohu-device-rail\[data-stream="open"\] \.yohu-device-rail__heading\s*\{[^}]*flex:\s*1 1 auto/,
    );
    expect(css).toMatch(
      /\.yohu-device-rail:not\(\[data-stream="open"\]\) \.yohu-device-rail__header\s*\{[^}]*gap:\s*0/,
    );
    expect(decls("yohu-device-rail__header")).toMatch(
      /transition:\s*gap\s+var\(--yohu-motion-spatial-rail\)/,
    );
    expect(css).not.toContain(".yohu-device-rail__header > :last-child");
    expect(css).not.toContain(".yohu-device-rail__header .yohu-subheader");
    expect(css).not.toMatch(/max-height:\s*42%/);
    expect(css.includes("collapse__inner")).toBe(false);
    expect(css).toContain('data-rail="icons"');
    expect(css).not.toContain("data-presentation");
    expect(css).not.toMatch(
      /\.yohu-layout__rail:not\(\[data-phase="expanded"\]\).*display:\s*none/,
    );
    expect(css).toContain("--yohu-layout-shell-nav-icons");
    expect(css).toMatch(/\.yohu-layout__work\s*\{[^}]*display:\s*flex/);
    expect(css).toMatch(
      /\.yohu-layout__rail\[data-rail="expanded"\]\s*\{[^}]*flex-basis:\s*var\(--yohu-layout-shell-nav\)/,
    );
    expect(css).toMatch(
      /\.yohu-layout__rail\[data-rail="expanded"\]\s*\{[^}]*width:\s*var\(--yohu-layout-shell-nav\)/,
    );
    expect(css).toMatch(
      /\.yohu-layout__rail\[data-rail="icons"\]\s*\{[^}]*width:\s*var\(--yohu-layout-shell-nav-icons\)/,
    );
    expect(css).not.toMatch(
      /(?:^|\n)\.yohu-layout__rail\s*\{[^}]*width:\s*var\(--yohu-layout-shell-nav\)/,
    );
    expect(css).not.toContain("yohu-layout--rail-collapsed");
    expect(css).not.toMatch(/grid-template-columns:\s*0\s+minmax/);
    expect(css).not.toMatch(
      /\.yohu-layout\[data-rail="(?:expanded|icons)"\]\s*\{[^}]*grid-template-columns/,
    );
    expect(css).toMatch(/\.yohu-layout__rail-inner\s*\{[^}]*width:\s*100%/);
    expect(css).not.toMatch(
      /\.yohu-layout__rail-inner\s*\{[^}]*min-width:\s*var\(--yohu-layout-shell-nav\)/,
    );
  });

  it("无设备折叠 hug；有列表才 fill，不穿 __inner", async () => {
    mocks.deviceRefresh.mockResolvedValue([]);
    await deviceStore.refresh();
    const empty = render(() => <DeviceRail />);
    const emptyRail = empty.container.querySelector(".yohu-device-rail");
    const emptyCollapse = empty.container.querySelector(".yohu-collapse");
    expect(emptyRail?.getAttribute("data-empty")).toBe("true");
    expect(emptyCollapse?.getAttribute("data-recipe")).toBe("collapse");
    expect(emptyCollapse?.getAttribute("data-open")).toBe("true");
    expect(emptyRail?.querySelector(".yohu-device-rail__body")).toBeTruthy();
    expect(emptyRail?.querySelector(".yohu-device-rail__list")).toBeNull();
    expect(emptyRail?.querySelector(".yohu-device-rail__empty")).toBeNull();
    empty.unmount();

    mocks.deviceRefresh.mockResolvedValue([
      { serial: "A1", model: "Moto X", state: "online", connection: "usb" },
    ]);
    await deviceStore.refresh();
    const { container } = render(() => <DeviceRail />);
    const rail = container.querySelector(".yohu-device-rail");
    const collapse = container.querySelector(".yohu-collapse");
    expect(rail?.hasAttribute("data-empty")).toBe(false);
    expect(collapse?.getAttribute("data-recipe")).toBe("fill");
    expect(collapse?.getAttribute("data-open")).toBe("true");
    expect(rail?.querySelector(".yohu-device-rail__body")).toBeTruthy();
    expect(rail?.querySelector(".yohu-device-rail__list")).toBeTruthy();
    expect(rail?.querySelector(".yohu-device-rail__empty")).toBeNull();
  });

  it("图标轨只留状态点，仍能选设备", async () => {
    mocks.deviceRefresh.mockResolvedValue([
      { serial: "A1", model: "Moto X", state: "online", connection: "usb" },
      { serial: "B2", model: "Moto Y", state: "online", connection: "usb" },
    ]);
    await deviceStore.refresh();
    const { container } = render(() => <DeviceRail intent="icons" />);
    const items = Array.from(container.querySelectorAll('[role="option"]'));
    expect(items).toHaveLength(2);
    expect(items[0]?.querySelector(".yohu-status-dot")).toBeTruthy();
    expect(container.querySelector(".yohu-device-rail")?.hasAttribute("data-rail")).toBe(false);
    expect(container.querySelector(".yohu-device-rail")?.getAttribute("data-stream")).toBe("closed");
    expect(items[0]?.getAttribute("aria-label")).toContain("Moto X");
    expect(items[0]?.getAttribute("aria-label")).toContain("A1");
    expect(items[0]?.getAttribute("title")).toBeNull();
    fireEvent.click(items[1] as HTMLElement);
    expect(deviceStore.state.focusSerial).toBe("B2");
  });

  it("设备卡不包 YoTooltip；图标轨只给状态点挂气泡", () => {
    const roots = [
      resolve(process.cwd(), "src"),
      resolve(process.cwd(), "packages/workbench/src"),
    ];
    const root = roots.find((path) => existsSync(path));
    expect(root).toBeTruthy();
    const src = readFileSync(resolve(root!, "shell/DeviceRail.tsx"), "utf-8");
    expect(src).not.toMatch(/<YoTooltip[\s\S]*?<YoListItem/);
    expect(src).toContain("<YoTooltip content={tip()}>{statusDot()}</YoTooltip>");
    expect(src).toContain("railTooltipEnabled");
  });
});

describe("NavList（§3 模块导航）", () => {
  it("激活项 aria-current + roving tabindex；点击/Enter 导航", () => {
    const onNavigate = vi.fn();
    const { container } = render(() => <NavList activeId={ModuleId.Terminal} onNavigate={onNavigate} />);
    const active = container.querySelector('[aria-current="page"]');
    expect(active).toBeTruthy();
    expect(active?.classList.contains("yohu-interactive--selected")).toBe(true);
    expect(active?.classList.contains("yohu-nav__item--active")).toBe(false);
    expect(active?.classList.contains("yohu-list-item")).toBe(true);
    expect(active?.getAttribute("tabindex")).toBe("0");
    expect(active?.getAttribute("title")).toBeNull();
    const settingsItem = Array.from(container.querySelectorAll(".yohu-list-item")).find((el) =>
      el.textContent?.includes("设置"),
    );
    expect(settingsItem).toBeTruthy();
    fireEvent.click(settingsItem as HTMLElement);
    expect(onNavigate).toHaveBeenCalledWith(ModuleId.Settings);
    fireEvent.keyDown(settingsItem as HTMLElement, { key: "Enter" });
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it("每个导航项都有独立图标（不因模块复用而消失）", () => {
    const { container } = render(() => <NavList activeId={ModuleId.Files} onNavigate={() => undefined} />);
    const items = container.querySelectorAll(".yohu-nav .yohu-list-item");
    expect(items.length).toBeGreaterThanOrEqual(4);
    items.forEach((item) => {
      expect(item.querySelector("svg.yohu-icon")).toBeTruthy();
      expect(item.querySelector("svg.yohu-icon")?.getAttribute("width")).toBe(String(Layout.IconSm));
    });
  });

  it("占位模块「开发中」走 YoBadge", () => {
    render(() => <NavList activeId={ModuleId.Terminal} onNavigate={() => undefined} />);
    const badge = screen.getByText("开发中");
    expect(badge.classList.contains("yohu-badge") || badge.closest(".yohu-badge")).toBeTruthy();
  });

  it("投屏模块不再显示「开发中」徽章", () => {
    render(() => <NavList activeId={ModuleId.Mirror} onNavigate={() => undefined} />);
    const mirror = screen.getByText(ModuleTitle.Mirror).closest(".yohu-list-item");
    expect(mirror?.textContent).not.toContain("开发中");
    expect(screen.getByText("开发中")).toBeTruthy();
  });

  it("设置钉在侧栏底部，与模块用横线隔开", () => {
    const { container } = render(() => (
      <NavList activeId={ModuleId.Terminal} onNavigate={() => undefined} />
    ));
    const moduleTitles = Array.from(
      container.querySelectorAll(".yohu-nav__modules .yohu-list-item"),
    ).map((el) => el.textContent ?? "");
    expect(moduleTitles.some((t) => t.includes("设置"))).toBe(false);
    expect(moduleTitles.some((t) => t.includes(ModuleTitle.Terminal))).toBe(true);

    const footerItems = container.querySelectorAll(".yohu-nav__footer .yohu-list-item");
    expect(footerItems).toHaveLength(1);
    expect(footerItems[0]?.textContent).toContain("设置");
    expect(container.querySelector(".yohu-divider")).toBeTruthy();

    const allItems = container.querySelectorAll(".yohu-nav .yohu-list-item");
    expect(allItems[allItems.length - 1]?.textContent).toContain("设置");
  });

  it("图标轨用 aria-label 导航，图标仍在", () => {
    const onNavigate = vi.fn();
    const { container } = render(() => (
      <NavList intent="icons" activeId={ModuleId.Terminal} onNavigate={onNavigate} />
    ));
    const settings = container.querySelector('[aria-label="设置"]');
    expect(settings?.querySelector("svg.yohu-icon")).toBeTruthy();
    expect(settings?.getAttribute("title")).toBeNull();
    fireEvent.click(settings as HTMLElement);
    expect(onNavigate).toHaveBeenCalledWith(ModuleId.Settings);
  });

  it("导航行不包 YoTooltip；图标轨只给 leading 图标挂气泡", () => {
    const roots = [
      resolve(process.cwd(), "src"),
      resolve(process.cwd(), "packages/workbench/src"),
    ];
    const root = roots.find((path) => existsSync(path));
    expect(root).toBeTruthy();
    const src = readFileSync(resolve(root!, "shell/NavList.tsx"), "utf-8");
    expect(src).not.toMatch(/<YoTooltip[\s\S]*?<YoListItem/);
    expect(src).toContain("<YoTooltip content={tip()}>{icon()}</YoTooltip>");
    expect(src).toContain("railTooltipEnabled");
  });
});

describe("StatusBar（§3 状态栏）", () => {
  it("任务项明细走 aria-label，不画气泡", async () => {
    taskStore.bindIpc();
    expect(mocks.taskHandler).not.toBeNull();
    mocks.taskHandler?.({
      tasks: [
        { id: 1, name: "上传: x.apk", active: true, detail: "C:\\x.apk → /sdcard/x.apk" },
      ],
    });
    await Promise.resolve();
    const { container } = render(() => <StatusBar />);
    const task = container.querySelector(".yohu-status__task");
    expect(task?.textContent).toBe("上传: x.apk");
    expect(task?.getAttribute("title")).toBeNull();
    expect(task?.getAttribute("aria-label")).toBe("C:\\x.apk → /sdcard/x.apk");
  });

  it("版本文案来自 system.info 身份", async () => {
    mocks.systemInfo.mockResolvedValue({
      identity: { ...DEFAULT_IDENTITY, version: "9.9.9" },
      paths: { ...RESOLVED_PATHS },
      adb_path: RESOLVED_ADB,
      settings: { ...DEFAULT_SETTINGS },
      os: "windows",
    });
    await settingsStore.load();
    render(() => <StatusBar />);
    expect(screen.getByText("Yohu ADB Tools v9.9.9")).toBeTruthy();
    expect(screen.getByText("12 fps")).toBeTruthy();
    mocks.systemInfo.mockResolvedValue({
      identity: { ...DEFAULT_IDENTITY },
      paths: { ...RESOLVED_PATHS },
      adb_path: RESOLVED_ADB,
      settings: { ...DEFAULT_SETTINGS },
      os: "windows",
    });
    await settingsStore.load();
  });
});

describe("SettingsView（§4.4 设置分组卡片）", () => {
  beforeEach(async () => {
    await settingsStore.load();
  });

  it("生效说明徽章齐备（立即/重启/下次采集）", () => {
    render(() => <SettingsView />);
    expect(screen.getAllByText("立即生效").length).toBeGreaterThan(0);
    expect(screen.getAllByText("重启生效").length).toBeGreaterThan(0);
    expect(screen.getAllByText("下次采集生效").length).toBeGreaterThan(0);
  });

  it("日志导出设置项可见（默认路径 / 每次询问保存位置）", () => {
    render(() => <SettingsView />);
    expect(screen.getByText("默认导出路径")).toBeTruthy();
    expect(screen.getByText("每次导出询问保存位置")).toBeTruthy();
  });

  it("日志显示列复选框可见且默认不含 UID/TID", () => {
    render(() => <SettingsView />);
    expect(screen.getByText("日志显示列")).toBeTruthy();
    for (const name of ["时间", "PID", "级别", "Tag"]) {
      expect((screen.getByRole("checkbox", { name }) as HTMLInputElement).checked).toBe(true);
    }
    for (const name of ["UID", "TID"]) {
      expect((screen.getByRole("checkbox", { name }) as HTMLInputElement).checked).toBe(false);
    }
  });

  it("日志显示列走 YoFormRow：标题备注在左侧信息栈，复选在右侧控件槽", () => {
    render(() => <SettingsView />);
    const title = screen.getByText("日志显示列");
    const row = title.closest(".yohu-form-row");
    expect(row?.getAttribute("data-has-note")).toBe("true");
    expect(row?.hasAttribute("data-has-description")).toBe(false);
    expect(row?.querySelector(".yohu-settings__checks")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "时间" })).toBeTruthy();
  });

  it("关闭 PID 列立即写入 log_display_columns", async () => {
    render(() => <SettingsView />);
    fireEvent.click(screen.getByRole("checkbox", { name: "PID" }));
    await waitFor(() => {
      expect(mocks.settingsSet).toHaveBeenCalledWith(
        "log_display_columns",
        expect.objectContaining({ pid: false, ts: true, uid: false, tid: false, tag: true }),
      );
    });
  });

  it("浏览按钮：选择 adb.exe 后写入 adb_path 并弹保存 toast", async () => {
    mocks.dialogOpenFile.mockResolvedValue("C:\\tools\\adb.exe");
    render(() => <SettingsView />);
    fireEvent.click(screen.getAllByText("浏览")[0] as HTMLElement);
    await waitFor(() => {
      expect(mocks.settingsSet).toHaveBeenCalledWith("adb_path", "C:\\tools\\adb.exe");
    });
    await waitFor(() => {
      expect(screen.getByText("已保存（立即生效）")).toBeTruthy();
    });
  });

  it("三项文件位置统一：只读 YoTextField + 浏览；数据目录走选文件夹", async () => {
    render(() => <SettingsView />);
    const adb = await waitFor(() => screen.getByLabelText("ADB 路径") as HTMLInputElement);
    expect(adb.readOnly).toBe(true);
    expect(adb.value).toContain("adb.exe");
    expect(document.querySelectorAll(".yohu-settings__path")).toHaveLength(0);
    expect(document.querySelectorAll(".yohu-text-field[data-readonly]")).toHaveLength(4);
    expect(screen.getAllByText("浏览")).toHaveLength(3);
    expect(screen.getAllByText("打开")).toHaveLength(1);
    for (const name of ["ADB 路径", "数据目录"]) {
      const row = screen.getByLabelText(name).closest(".yohu-form-row");
      expect(row?.getAttribute("data-has-note")).toBe("true");
      expect(row?.hasAttribute("data-has-description")).toBe(false);
    }

    mocks.dialogOpenDirectory.mockResolvedValue("D:\\YohuData");
    fireEvent.click(screen.getAllByText("浏览")[1] as HTMLElement);
    await waitFor(() => {
      expect(mocks.dialogOpenDirectory).toHaveBeenCalledWith(
        expect.objectContaining({ title: "选择数据目录" }),
      );
      expect(mocks.settingsSet).toHaveBeenCalledWith("data_root", "D:\\YohuData");
    });
  });

  it("日志时间格式切换立即写入 log_time_format", async () => {
    render(() => <SettingsView />);
    expect(screen.getByText("清单时间显示")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "日期 + 时分秒.毫秒（默认）" }));
    fireEvent.click(screen.getByText("时分秒.毫秒", { exact: true }));
    await waitFor(() => {
      expect(mocks.settingsSet).toHaveBeenCalledWith("log_time_format", "time_millis");
    });
  });

  it("日志内容配色切换立即写入 log_color_scheme", async () => {
    render(() => <SettingsView />);
    expect(screen.getByText("内容配色")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yohu（默认）" }));
    fireEvent.click(screen.getByText("LogCat", { exact: true }));
    await waitFor(() => {
      expect(mocks.settingsSet).toHaveBeenCalledWith("log_color_scheme", "logcat");
    });
  });

  it("终端时间格式切换立即写入 terminal_time_format", async () => {
    render(() => <SettingsView />);
    expect(screen.getByText("结果显示时间格式")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "时分秒.毫秒（默认）" }));
    fireEvent.click(screen.getByText("日期 + 时分秒.毫秒", { exact: true }));
    await waitFor(() => {
      expect(mocks.settingsSet).toHaveBeenCalledWith("terminal_time_format", "datetime_millis");
    });
  });

  it("密度切换：保存到 core 并应用到 documentElement", async () => {
    render(() => <SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "舒适（默认）" }));
    fireEvent.click(screen.getByText("紧凑"));
    await waitFor(() => {
      expect(mocks.settingsSet).toHaveBeenCalledWith("density", "compact");
    });
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-density")).toBe("compact");
    });
  });

  it("保存失败弹错误 toast", async () => {
    mocks.settingsSet.mockRejectedValueOnce({ code: "internal", message: "disk full" });
    render(() => <SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: /浅色|跟随系统|深色/ }));
    fireEvent.click(screen.getByText("深色"));
    await waitFor(() => {
      expect(screen.getByText(/保存失败/)).toBeTruthy();
    });
  });

  it("非法数字不在 View 吞掉，走 settings.set", async () => {
    mocks.settingsSet.mockRejectedValueOnce({
      code: "invalid_args",
      message: "buffer_capacity 必须大于 0",
    });
    render(() => <SettingsView />);
    fireEvent.change(screen.getByLabelText("缓冲最大行数"), { target: { value: "0" } });
    await waitFor(() => {
      expect(mocks.settingsSet).toHaveBeenCalledWith("buffer_capacity", 0);
      expect(screen.getByText(/保存失败/)).toBeTruthy();
    });
  });

  it("小数串不截成整数，原样进 settings.set", async () => {
    mocks.settingsSet.mockRejectedValueOnce({
      code: "invalid_args",
      message: "buffer_capacity 必须是非负整数",
    });
    render(() => <SettingsView />);
    fireEvent.change(screen.getByLabelText("缓冲最大行数"), { target: { value: "1.5" } });
    await waitFor(() => {
      expect(mocks.settingsSet).toHaveBeenCalledWith("buffer_capacity", "1.5");
      expect(screen.getByText(/必须是非负整数/)).toBeTruthy();
    });
  });

  it("设置页不再二次 settingsStore.load", async () => {
    mocks.systemInfo.mockClear();
    render(() => <SettingsView />);
    await Promise.resolve();
    expect(mocks.systemInfo).not.toHaveBeenCalled();
  });

  it("进入设置不打 update.info", async () => {
    mocks.updateInfo.mockClear();
    render(() => <SettingsView />);
    await Promise.resolve();
    expect(mocks.updateInfo).not.toHaveBeenCalled();
  });

  it("启用项为 YoSwitch，无「启用」字样", () => {
    render(() => <SettingsView />);
    expect(screen.getByRole("switch", { name: "设备自动刷新" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "开始采集前清空设备缓冲（logcat -c）" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "输入命令默认加上 adb" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "拖入时指向文件夹" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "强制 ADB forward（跳过 reverse）" })).toBeTruthy();
    expect(screen.queryByText("启用")).toBeNull();
    expect(screen.queryByText("自动刷新间隔")).toBeNull();
    expect(screen.queryByText(/间隔（秒/)).toBeNull();
    expect(screen.queryByText(/0 = 关/)).toBeNull();
  });

  it("设备自动刷新立即写入布尔值", async () => {
    render(() => <SettingsView />);
    fireEvent.click(screen.getByRole("switch", { name: "设备自动刷新" }));
    await waitFor(() => {
      expect(mocks.settingsSet).toHaveBeenCalledWith("devices_auto_refresh", false);
    });
    await waitFor(() => {
      expect(screen.getByText("已保存（立即生效）")).toBeTruthy();
    });
  });

  it("页眉与分组卡片分列：标题不进滚动容器", () => {
    const { container } = render(() => <SettingsView />);
    const root = container.querySelector(".yohu-settings");
    const chromeWrap = root?.querySelector(":scope > .yohu-settings__chrome");
    const chrome = chromeWrap?.querySelector(".yohu-chrome");
    const body = root?.querySelector(":scope > .yohu-settings__body");
    expect(chromeWrap).toBeTruthy();
    expect(chrome).toBeTruthy();
    expect(body).toBeTruthy();
    expect(body?.querySelector(".yohu-scroller")).toBeTruthy();
    expect(body?.querySelector(".yohu-panel")).toBeTruthy();
    expect(body?.contains(chrome as Node)).toBe(false);
  });

  it("关于面板展示身份与路径，打开走 system.openPath", async () => {
    render(() => <SettingsView />);
    await waitFor(() => {
      expect(screen.getByText("0.1.0")).toBeTruthy();
    });
    expect(screen.getByText("com.yohu.adbtools")).toBeTruthy();
    expect(screen.queryByText("数据根")).toBeNull();
    expect(screen.queryByText("安装目录")).toBeNull();
    expect(screen.queryByText("配置目录")).toBeNull();
    expect(screen.queryByText("缓存")).toBeNull();
    expect(screen.getByText("应用日志")).toBeTruthy();
    const aboutIcon = document.querySelector(".yohu-settings__about-icon");
    expect(aboutIcon?.getAttribute("width")).toBe(String(Layout.TitlebarCaption));
    expect(aboutIcon?.getAttribute("height")).toBe(String(Layout.TitlebarCaption));
    const openButtons = screen.getAllByRole("button", { name: "打开" });
    expect(openButtons.length).toBe(1);
    fireEvent.click(openButtons[0] as HTMLButtonElement);
    await waitFor(() => {
      expect(mocks.systemOpenPath).toHaveBeenCalledWith(RESOLVED_PATHS.logs_dir);
    });
  });

  it("关于面板可检查更新；已最新提示；有新版本则下载后确认安装", async () => {
    render(() => <SettingsView />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "检查更新" })).toBeTruthy();
    });
    expect(screen.queryByRole("heading", { name: "更新" })).toBeNull();
    const about = screen.getByRole("heading", { name: "关于" }).closest(".yohu-panel");
    expect(about?.textContent).toContain("检查更新");
    fireEvent.click(screen.getByRole("button", { name: "检查更新" }) as HTMLButtonElement);
    await waitFor(() => {
      expect(mocks.updateCheck).toHaveBeenCalled();
      expect(screen.getByText("已是最新版本")).toBeTruthy();
    });

    mocks.updateCheck.mockResolvedValueOnce({
      has_new_version: true,
      version: "1.2.0",
      description: "修复若干问题",
      installer_url: "https://example.com/setup.exe",
      page_url: "https://github.com/yohurm/Windows-YoADBTools",
      sha256: "",
      size_bytes: 0,
    });
    fireEvent.click(screen.getByRole("button", { name: "检查更新" }) as HTMLButtonElement);
    await waitFor(() => {
      expect(screen.getByText("发现新版本")).toBeTruthy();
      expect(screen.getByText("1.2.0")).toBeTruthy();
      expect(screen.getByText("修复若干问题")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "下载" }) as HTMLButtonElement);
    await waitFor(() => {
      expect(mocks.updateDownload).toHaveBeenCalledWith({
        url: "https://example.com/setup.exe",
        sha256: "",
        size_bytes: 0,
        version: "1.2.0",
      });
      expect(mocks.updateInstall).not.toHaveBeenCalled();
      expect(screen.getByText("安装更新")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "安装并重启" }) as HTMLButtonElement);
    await waitFor(() => {
      expect(mocks.updateInstall).toHaveBeenCalledWith("C:\\Temp\\YohuAdbTools-update\\setup.exe");
    });
  });

  it("稍后关窗不清 pending，出场期间仍能读版本", async () => {
    render(() => <SettingsView />);
    mocks.updateCheck.mockResolvedValueOnce({
      has_new_version: true,
      version: "1.2.0",
      description: "修复若干问题",
      installer_url: "https://example.com/setup.exe",
      page_url: "https://github.com/yohurm/Windows-YoADBTools",
      sha256: "",
      size_bytes: 0,
    });
    fireEvent.click(screen.getByRole("button", { name: "检查更新" }) as HTMLButtonElement);
    await waitFor(() => {
      expect(screen.getByText("1.2.0")).toBeTruthy();
    });
    expect(updateStore.pending()?.version).toBe("1.2.0");
    fireEvent.click(screen.getByRole("button", { name: "稍后" }) as HTMLButtonElement);
    expect(updateStore.dialogOpen()).toBe(false);
    expect(updateStore.pending()).toBeNull();
  });
});

describe("AppLayout 窗口铬", () => {
  it("渲染标题栏且三键为最小化、最大化、关闭", () => {
    navStore.navigate(ModuleId.Terminal);
    render(() => <AppLayout />);
    expect(screen.getByText("Yohu ADB Tools")).toBeTruthy();
    expect(screen.getByRole("button", { name: "最小化" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "最大化" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "关闭" })).toBeTruthy();
    expect(document.querySelector(".yohu-window")).toBeTruthy();
  });

  it("模块标题与功能栏在右侧内容区，不进窗口标题栏", () => {
    navStore.navigate(ModuleId.Settings);
    render(() => <AppLayout />);
    const titlebar = document.querySelector(".yohu-titlebar");
    expect(titlebar?.textContent).not.toContain("设置");
    const content = document.querySelector(".yohu-layout__content") as HTMLElement;
    expect(within(content).getByText("设置")).toBeTruthy();
  });

  it("主题钮在展开侧栏按钮左侧，点击即切深浅并落盘", async () => {
    navStore.navigate(ModuleId.Terminal);
    render(() => <AppLayout />);
    const theme = screen.getByRole("button", { name: "切换到深色模式" });
    const rail = screen.getByRole("button", { name: "收起侧栏" });
    expect(theme.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(theme);
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      expect(mocks.settingsSet).toHaveBeenCalledWith("theme", "dark");
    });
  });

  it("侧栏可收起为图标轨，导航仍可点", () => {
    navStore.navigate(ModuleId.Terminal);
    render(() => <AppLayout />);
    fireEvent.click(screen.getByRole("button", { name: "收起侧栏" }));
    const layout = document.querySelector(".yohu-layout");
    expect(layout?.getAttribute("data-rail")).toBe("icons");
    expect(document.querySelector(".yohu-layout__rail")?.getAttribute("data-phase")).toBe("icons");
    expect(document.querySelector(".yohu-layout__rail")?.getAttribute("data-stream")).toBe("closed");
    expect(document.querySelector(".yohu-layout__rail.yohu-recipe-rail")).toBeTruthy();
    expect(document.querySelector(".yohu-layout.yohu-recipe-rail")).toBeNull();
    expect(document.querySelector(".yohu-layout--rail-collapsed")).toBeNull();
    expect(Boolean((document.querySelector(".yohu-layout__rail") as HTMLElement | null)?.inert)).toBe(
      false,
    );
    const icons = document.querySelectorAll(".yohu-nav .yohu-list-item svg.yohu-icon");
    expect(icons.length).toBeGreaterThanOrEqual(4);
    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(navStore.activeModuleId()).toBe(ModuleId.Settings);
    fireEvent.click(screen.getByRole("button", { name: "展开侧栏" }));
    const opened = document.querySelector(".yohu-layout");
    expect(opened?.getAttribute("data-rail")).toBe("expanded");
    expect(document.querySelector(".yohu-layout__rail")?.getAttribute("data-phase")).toBe(
      "expanded",
    );
    expect(document.querySelector(".yohu-layout__rail")?.getAttribute("data-stream")).toBe("open");
  });

  it("切换设备后内容区选中设备名立即更新，不依赖切模块", async () => {
    mocks.deviceRefresh.mockResolvedValue([]);
    await deviceStore.refresh();
    mocks.deviceRefresh.mockResolvedValue([
      { serial: "A1", model: "Moto X", state: "online", connection: "usb" },
      { serial: "B2", model: "Moto Y", state: "online", connection: "usb" },
    ]);
    await deviceStore.refresh();
    navStore.navigate(ModuleId.Files);
    render(() => <AppLayout />);
    expect(screen.getByTestId("session-probe").textContent).toBe("Moto X");
    const items = Array.from(document.querySelectorAll('[role="option"]'));
    fireEvent.click(items[1] as HTMLElement);
    expect(screen.getByTestId("session-probe").textContent).toBe("Moto Y");
  });

  it("切到投屏时 store 打开 HWND", async () => {
    mocks.mirrorPresentSetActive.mockClear();
    navStore.navigate(ModuleId.Mirror);
    render(() => <AppLayout />);
    await waitFor(() => {
      expect(mocks.mirrorPresentSetActive).toHaveBeenCalledWith(true);
    });
  });

  it("从其他模块切回投屏时同一拍打开 HWND", async () => {
    navStore.navigate(ModuleId.Terminal);
    render(() => <AppLayout />);
    mocks.mirrorPresentSetActive.mockClear();
    navStore.navigate(ModuleId.Mirror);
    await waitFor(() => {
      expect(mocks.mirrorPresentSetActive).toHaveBeenCalledWith(true);
    });
    expect(screen.getByTestId("mirror-stage")).toBeTruthy();
  });

  it("离投屏同一拍关闭 HWND", async () => {
    navStore.navigate(ModuleId.Mirror);
    render(() => <AppLayout />);
    await waitFor(() => {
      expect(mocks.mirrorPresentSetActive).toHaveBeenCalledWith(true);
    });
    mocks.mirrorPresentSetActive.mockClear();
    navStore.navigate(ModuleId.Terminal);
    await waitFor(() => {
      expect(mocks.mirrorPresentSetActive).toHaveBeenCalledWith(false);
    });
  });

  it("淡出未结束时再切回投屏仍打开 HWND", async () => {
    navStore.navigate(ModuleId.Mirror);
    render(() => <AppLayout />);
    await waitFor(() => {
      expect(mocks.mirrorPresentSetActive).toHaveBeenCalledWith(true);
    });
    navStore.navigate(ModuleId.Terminal);
    await waitFor(() => {
      expect(mocks.mirrorPresentSetActive).toHaveBeenCalledWith(false);
    });
    mocks.mirrorPresentSetActive.mockClear();
    navStore.navigate(ModuleId.Mirror);
    await waitFor(() => {
      expect(mocks.mirrorPresentSetActive).toHaveBeenCalledWith(true);
    });
    expect(screen.getByTestId("mirror-stage")).toBeTruthy();
  });
});

describe("settingsStore 外观应用", () => {
  it("加载快照后应用主题与密度到 documentElement", async () => {
    mocks.systemInfo.mockResolvedValue({
      identity: { ...DEFAULT_IDENTITY },
      paths: { ...RESOLVED_PATHS },
      adb_path: "",
      settings: { ...DEFAULT_SETTINGS, theme: "dark", density: "comfortable" },
      os: "windows",
    });
    await settingsStore.load();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-density")).toBe("comfortable");
  });
});

describe("App 启动编排", () => {
  it("揭主窗口后加载，再扫描", async () => {
    mocks.windowShow.mockClear();
    mocks.deviceRefresh.mockClear();
    const { unmount } = render(() => <App />);
    await waitFor(() => {
      expect(mocks.windowShow).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mocks.deviceRefresh).toHaveBeenCalled();
    });
    const showOrder = mocks.windowShow.mock.invocationCallOrder[0]!;
    const refreshOrder = mocks.deviceRefresh.mock.invocationCallOrder[0]!;
    expect(showOrder).toBeLessThan(refreshOrder);
    unmount();
  });
});

describe("View 不越级 IPC", () => {
  it("壳 View 不 import dialog/openPath/present/窗口三键", () => {
    const roots = [
      resolve(process.cwd(), "src"),
      resolve(process.cwd(), "packages/workbench/src"),
    ];
    const root = roots.find((path) => existsSync(path));
    expect(root).toBeTruthy();
    const banned =
      /dialogOpen(?:File|Directory)|systemOpenPath|mirrorPresentSetActive|windowMinimize|windowToggleMaximize|windowClose|windowShow/;
    for (const rel of [
      "App.tsx",
      "settings/SettingsView.tsx",
      "settings/SettingsForm.tsx",
      "settings/PathChrome.tsx",
      "settings/UpdateDialogs.tsx",
      "shell/AppLayout.tsx",
      "shell/DeviceRail.tsx",
      "shell/NavList.tsx",
      "shell/StatusBar.tsx",
    ]) {
      const src = readFileSync(resolve(root!, rel), "utf-8");
      expect(src, rel).not.toMatch(banned);
      expect(src, rel).not.toContain("deviceLabel");
      expect(src, rel).not.toContain("__scroller");
    }
  });

  it("壳测试不点 YoUI 未公开 BEM", () => {
    const candidates = [
      resolve(process.cwd(), "src/shell/Shell.test.tsx"),
      resolve(process.cwd(), "packages/workbench/src/shell/Shell.test.tsx"),
    ];
    const src =
      candidates.map((path) => (existsSync(path) ? readFileSync(path, "utf-8") : "")).find(Boolean) ??
      "";
    expect(src.length).toBeGreaterThan(0);
    const banned = [
      [".yohu-subheader", "__"].join(""),
      [".yohu-collapse", "__"].join(""),
      [".yohu-list-item", "__"].join(""),
      [".yohu-tooltip", "__"].join(""),
      [".yohu-form-row", "__"].join(""),
      [".yohu-titlebar", "__"].join(""),
      [".yohu-icon", "-button"].join(""),
      [".yohu-chrome", "__title"].join(""),
    ];
    for (const sel of banned) {
      expect(src, sel).not.toContain(sel);
    }
  });
});
