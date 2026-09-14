/**
 * 事件订阅：listen 失败立即 reject；负载原样转发。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listen } from "@tauri-apps/api/event";

import { onDevicesChanged } from "./events";
import type { AppEvent } from "./types";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

beforeEach(() => {
  vi.mocked(listen).mockReset();
  vi.mocked(listen).mockImplementation(() => Promise.resolve(() => undefined));
});

afterEach(() => {
  vi.mocked(listen).mockClear();
});

describe("on() 订阅", () => {
  it("成功路径 resolve 出 unlisten（只 attach 一次）", async () => {
    const unlisten = vi.fn(() => undefined);
    vi.mocked(listen).mockResolvedValueOnce(unlisten);

    const got = await onDevicesChanged(() => {});
    expect(vi.mocked(listen)).toHaveBeenCalledTimes(1);
    expect(got).toBe(unlisten);
  });

  it("listen 失败立即 reject", async () => {
    const ipcDown = new Error("ipc down");
    vi.mocked(listen).mockRejectedValueOnce(ipcDown);

    await expect(onDevicesChanged(() => {})).rejects.toThrow("ipc down");
    expect(vi.mocked(listen)).toHaveBeenCalledTimes(1);
  });

  it("原样转发已是 AppEvent 的负载", async () => {
    let captured: ((event: { payload: AppEvent }) => void) | undefined;
    vi.mocked(listen).mockImplementation((_name, handler) => {
      captured = handler as (event: { payload: AppEvent }) => void;
      return Promise.resolve(() => undefined);
    });

    const received: AppEvent[] = [];
    await onDevicesChanged((e) => {
      received.push(e);
    });
    const payload: Extract<AppEvent, { kind: "devicesChanged" }> = {
      kind: "devicesChanged",
      devices: [],
    };
    captured!({ payload });
    expect(received[0]).toBe(payload);
  });
});
