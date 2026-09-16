import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentWebview } from "@tauri-apps/api/webview";

import { onNativeDragDrop, type NativeDragDropEvent } from "./drag";

type DragPayload =
  | { type: "enter"; paths: string[]; position: { x: number; y: number } }
  | { type: "over"; position: { x: number; y: number } }
  | { type: "drop"; paths: string[]; position: { x: number; y: number } }
  | { type: "leave" };

const onDragDropEvent = vi.fn();

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: vi.fn(() => ({ onDragDropEvent })),
}));

beforeEach(() => {
  onDragDropEvent.mockReset();
  vi.mocked(getCurrentWebview).mockReturnValue({ onDragDropEvent } as never);
});

afterEach(() => {
  onDragDropEvent.mockClear();
});

describe("onNativeDragDrop", () => {
  it("只订官方 onDragDropEvent，payload 原样转发", async () => {
    let captured: ((event: { payload: DragPayload }) => void) | undefined;
    onDragDropEvent.mockImplementation((handler: (event: { payload: DragPayload }) => void) => {
      captured = handler;
      return Promise.resolve(() => undefined);
    });

    const received: NativeDragDropEvent[] = [];
    await onNativeDragDrop((event) => {
      received.push(event);
    });

    const enter: DragPayload = { type: "enter", paths: ["C:/a.txt"], position: { x: 20, y: 40 } };
    const over: DragPayload = { type: "over", position: { x: 40, y: 80 } };
    const drop: DragPayload = { type: "drop", paths: ["C:/a.txt"], position: { x: 20, y: 40 } };
    const leave: DragPayload = { type: "leave" };
    captured!({ payload: enter });
    captured!({ payload: over });
    captured!({ payload: drop });
    captured!({ payload: leave });

    expect(received).toEqual([enter, over, drop, leave]);
    expect(onDragDropEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getCurrentWebview)).toHaveBeenCalledTimes(1);
  });

  it("订阅失败立即 reject", async () => {
    onDragDropEvent.mockRejectedValueOnce(new Error("ipc down"));
    await expect(onNativeDragDrop(() => {})).rejects.toThrow("ipc down");
    expect(onDragDropEvent).toHaveBeenCalledTimes(1);
  });
});
