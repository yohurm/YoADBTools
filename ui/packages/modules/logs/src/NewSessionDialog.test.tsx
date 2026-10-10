/**
 * 新建窗口提交：点选 + 创建、检索 Enter、先关后开。
 * 订阅由 onCreated 交给 View 的 beginCapture，本文件只断言页签与回调。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import type { DeviceInfo } from "@yohu/api";
import { NewSessionDialog } from "./NewSessionDialog";
import { logStore } from "./store";

vi.mock("@yohu/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@yohu/api")>();
  const unlisten = async (): Promise<() => void> => () => undefined;
  return {
    ...actual,
    YoLog: { info: () => undefined, warn: () => undefined, error: () => undefined },
    logPackageSnapshot: vi.fn(async () => ["com.example.app"]),
    logProcessSnapshot: vi.fn(async () => []),
    logCaptureStart: vi.fn(async () => ({ generation: 1, adopted: false })),
    logCaptureStop: vi.fn(async () => undefined),
    logCaptureStatus: vi.fn(async () => ({ capturing: false, generation: 0 })),
    logClearDevice: vi.fn(async () => undefined),
    logReplay: vi.fn(async () => ({ serial: "", from_seq: 0, lines: [] })),
    logExport: vi.fn(),
    onLogBatch: unlisten,
    onLogHits: unlisten,
    onLogOverflow: unlisten,
    onProcessIndex: unlisten,
    onCaptureState: unlisten,
    onDeviceOffline: unlisten,
    onDevicesChanged: unlisten,
    onSettingsChanged: unlisten,
    systemLog: async () => undefined,
  };
});

const device: DeviceInfo = {
  serial: "S1",
  state: "online",
  model: "Test",
  connection: "usb",
};

function packageRow(): HTMLElement | null {
  return document.querySelector('[data-key="com.example.app"]');
}

function searchForm(): HTMLFormElement | null {
  return document.querySelector("form.yohu-search__bar");
}

describe("NewSessionDialog create path", () => {
  afterEach(() => {
    for (const session of [...logStore.state.sessions]) {
      logStore.closeSession(session.id);
    }
  });

  it("点选包名后创建会加页签并通知订阅", async () => {
    const [open, setOpen] = createSignal(true);
    const onClose = vi.fn(() => setOpen(false));
    const onCreated = vi.fn();
    const before = logStore.state.sessions.length;

    render(() => (
      <NewSessionDialog
        open={open}
        onClose={onClose}
        onCreated={onCreated}
        devices={[device]}
        focusSerial="S1"
      />
    ));

    await waitFor(() => {
      expect(packageRow()).toBeTruthy();
    });

    fireEvent.click(packageRow() as HTMLElement);
    await Promise.resolve();

    const createBtn = screen.getByRole("button", { name: "创建" }) as HTMLButtonElement;
    expect(createBtn.disabled).toBe(false);
    fireEvent.click(createBtn);

    expect(logStore.state.sessions.length).toBe(before + 1);
    expect(logStore.state.sessions.at(-1)?.scope).toEqual({
      kind: "package",
      pkg: "com.example.app",
      includeChild: false,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("检索 Enter 与创建同一提交", async () => {
    const [open, setOpen] = createSignal(true);
    const onClose = vi.fn(() => setOpen(false));
    const onCreated = vi.fn();
    const before = logStore.state.sessions.length;

    render(() => (
      <NewSessionDialog
        open={open}
        onClose={onClose}
        onCreated={onCreated}
        devices={[device]}
        focusSerial="S1"
      />
    ));

    await waitFor(() => {
      expect(searchForm()).toBeTruthy();
    });

    fireEvent.input(screen.getByLabelText("过滤或输入包名"), { target: { value: "com.example.app" } });
    fireEvent.submit(searchForm() as HTMLFormElement);

    expect(logStore.state.sessions.length).toBe(before + 1);
    expect(logStore.state.sessions.at(-1)?.scope).toEqual({
      kind: "package",
      pkg: "com.example.app",
      includeChild: false,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("先关后开再选包名仍能创建", async () => {
    const [open, setOpen] = createSignal(false);
    const onClose = vi.fn(() => setOpen(false));
    const onCreated = vi.fn();
    const before = logStore.state.sessions.length;

    render(() => (
      <NewSessionDialog
        open={open}
        onClose={onClose}
        onCreated={onCreated}
        devices={[device]}
        focusSerial="S1"
      />
    ));

    setOpen(true);
    await waitFor(() => {
      expect(packageRow()).toBeTruthy();
    });

    fireEvent.click(packageRow() as HTMLElement);
    await Promise.resolve();
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    expect(logStore.state.sessions.length).toBe(before + 1);
    expect(onCreated).toHaveBeenCalledTimes(1);
  });
});

describe("当前设备切片", () => {
  it("同一序列号只读一次设备切片", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "NewSessionDialog.tsx"), "utf8");
    const needle = "devices[" + "deviceSerial()]";
    expect(source.split(needle).length - 1).toBe(1);
    expect(source.split("deviceSlice()").length - 1).toBe(3);
    expect(source).toContain("sliceList(deviceSlice()?.processEntries)");
    expect(source).toContain("sliceList(deviceSlice()?.packages)");
  });
});

describe("切片上的列表缺省为空数组", () => {
  it("空数组字面量只留在 sliceList", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "NewSessionDialog.tsx"), "utf8");
    const needle = "?? " + "[]";
    expect(source.split(needle).length - 1).toBe(1);
    expect(source).toContain("const slice = deviceSlice()");
  });
});

describe("开闭沿走对话框公开读取", () => {
  it("不把 open 收成只能调用的函数", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "NewSessionDialog.tsx"), "utf8");
    expect(source).toContain("resolveDialogOpen(props.open)");
    expect(source).not.toContain("props.open()");
  });
});

describe("刷新时的加载只写一次", () => {
  it("watch_load_once", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "NewSessionDialog.tsx"), "utf8");
    const done = "void job.finally(() => " + "setLoading(false))";
    const start = "setLoading(" + "true)";
    expect(source.split(done).length - 1).toBe(1);
    expect(source.split(start).length - 1).toBe(1);
    expect(source).toContain("watchLoad(");
  });
});
