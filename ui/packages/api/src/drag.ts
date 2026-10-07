/**
 * L1：官方 webview 拖放。Tauri 已把 wry WindowEvent::DragDrop 收成
 * `tauri://drag-enter|over|drop|leave`；本文件只订这一路，原样转发 payload。
 * 不是 AppEvent。禁止再 listen 自造 `window/drag`。禁止几何换算。
 */

import { getCurrentWebview, type DragDropEvent } from "@tauri-apps/api/webview";
import type { UnlistenFn } from "@tauri-apps/api/event";

/** 官方 `onDragDropEvent` 负载。`position` 仍是物理点。 */
export type NativeDragDropEvent = DragDropEvent;

/** 松手。路径只在这一相上。 */
export function dragEventIsDrop(
  event: NativeDragDropEvent,
): event is Extract<NativeDragDropEvent, { type: "drop" }> {
  return event.type === "drop";
}

/** 松手路径是空的。 */
export function dragPathsAreEmpty(paths: readonly string[]): boolean {
  return paths.length === 0;
}

/** 指针还按着：enter 与 over。leave 与 drop 都不是悬停。 */
export function dragEventIsHover(
  event: NativeDragDropEvent,
): event is Extract<NativeDragDropEvent, { type: "enter" | "over" }> {
  return event.type === "enter" || event.type === "over";
}

export const NATIVE_DRAG_SUBSCRIBE_FAILED = "订阅官方拖放失败";

export function onNativeDragDrop(handler: (event: NativeDragDropEvent) => void): Promise<UnlistenFn> {
  return getCurrentWebview().onDragDropEvent((event) => {
    handler(event.payload);
  });
}

/** 订官方拖放。stop 若早于订阅完成，完成时立刻退订。失败交给 onFailed。 */
export function bindNativeDragDrop(
  handler: (event: NativeDragDropEvent) => void,
  onFailed?: (error: unknown) => void,
): () => void {
  let stop: UnlistenFn | undefined;
  let cancelled = false;
  void onNativeDragDrop(handler).then(
    (unlisten) => {
      if (cancelled) {
        unlisten();
        return;
      }
      stop = unlisten;
    },
    (error: unknown) => {
      onFailed?.(error);
    },
  );
  return () => {
    cancelled = true;
    stop?.();
    stop = undefined;
  };
}
