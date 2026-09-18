/**
 * 新建窗口提交：点选 + 创建、检索 Enter、先关后开。
 * 订阅由 onCreated 交给 View 的 beginCapture，本文件只断言页签与回调。
 */
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
