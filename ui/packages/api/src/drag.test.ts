import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getCurrentWebview } from "@tauri-apps/api/webview";

import {
  bindNativeDragDrop,
  dragEventIsDrop,
  dragEventIsHover,
  dragPathsAreEmpty,
  NATIVE_DRAG_SUBSCRIBE_FAILED,
  onNativeDragDrop,
  type NativeDragDropEvent,
} from "./drag";

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

describe("bindNativeDragDrop", () => {
  it("stop 早于订阅完成时立刻退订", async () => {
    let resolveListen: (unlisten: () => void) => void = () => undefined;
    const unlisten = vi.fn();
    onDragDropEvent.mockImplementation(
      () =>
        new Promise<() => void>((resolve) => {
          resolveListen = resolve;
        }),
    );
    const stop = bindNativeDragDrop(() => undefined);
    stop();
    resolveListen(unlisten);
    await Promise.resolve();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("订阅失败交给 onFailed，句子只有一处", async () => {
    onDragDropEvent.mockRejectedValueOnce(new Error("ipc down"));
    const failed: unknown[] = [];
    bindNativeDragDrop(() => undefined, (error) => {
      failed.push(error);
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(failed).toHaveLength(1);
    expect(NATIVE_DRAG_SUBSCRIBE_FAILED).toBe("订阅官方拖放失败");
  });
});

describe("drag event phase", () => {
  it("松手和悬停只在 drag.ts 里比较", () => {
    const drop = { type: "drop" as const, paths: ["a"], position: { x: 0, y: 0 } } as NativeDragDropEvent;
    const enter = { type: "enter" as const, paths: ["a"], position: { x: 0, y: 0 } } as NativeDragDropEvent;
    const over = { type: "over" as const, position: { x: 1, y: 1 } } as NativeDragDropEvent;
    const leave = { type: "leave" as const } as NativeDragDropEvent;
    expect(dragEventIsDrop(drop)).toBe(true);
    expect(dragEventIsDrop(enter)).toBe(false);
    expect(dragEventIsHover(enter)).toBe(true);
    expect(dragEventIsHover(over)).toBe(true);
    expect(dragEventIsHover(drop)).toBe(false);
    expect(dragEventIsHover(leave)).toBe(false);
    expect(dragPathsAreEmpty([])).toBe(true);
    expect(dragPathsAreEmpty(["a"])).toBe(false);

    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const emptyPaths = "event.paths.length === 0";
    const banned = [
      '.type === "drop"',
      '.type !== "drop"',
      '.type === "leave"',
      '.type === "enter"',
      '.type === "over"',
      '.type !== "enter"',
      '.type !== "over"',
      emptyPaths,
    ];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist") continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name) || name === "drag.ts") continue;
        let text = readFileSync(full, "utf8");
        const testFile = name.includes(".test.");
        if (testFile) text = text.replaceAll(emptyPaths, "");
        const needles = testFile ? [emptyPaths] : banned;
        for (const needle of needles) expect(text, full).not.toContain(needle);
      }
    };
    walk(root);
  });
});
