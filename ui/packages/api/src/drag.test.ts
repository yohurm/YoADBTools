import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listen } from "@tauri-apps/api/event";

import { NATIVE_DRAG_EVENT, onNativeDragDrop, type NativeDragDropEvent } from "./drag";

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

describe("onNativeDragDrop", () => {
  it("只 listen window/drag 并原样转发", async () => {
    let captured: ((event: { payload: NativeDragDropEvent }) => void) | undefined;
    vi.mocked(listen).mockImplementation((name, handler) => {
      expect(name).toBe(NATIVE_DRAG_EVENT);
      captured = handler as (event: { payload: NativeDragDropEvent }) => void;
      return Promise.resolve(() => undefined);
    });

    const received: NativeDragDropEvent[] = [];
    await onNativeDragDrop((event) => {
      received.push(event);
    });
    const payload: NativeDragDropEvent = { type: "drop", paths: ["C:/a.txt"], x: 10, y: 20 };
    captured!({ payload });
    expect(received[0]).toBe(payload);
    expect(vi.mocked(listen)).toHaveBeenCalledTimes(1);
  });

  it("listen 失败立即 reject", async () => {
    vi.mocked(listen).mockRejectedValueOnce(new Error("ipc down"));
    await expect(onNativeDragDrop(() => {})).rejects.toThrow("ipc down");
    expect(vi.mocked(listen)).toHaveBeenCalledTimes(1);
  });
});
