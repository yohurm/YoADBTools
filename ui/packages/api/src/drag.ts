/**
 * L1：官方 webview 拖放。Tauri 已把 wry WindowEvent::DragDrop 收成
 * `tauri://drag-enter|over|drop|leave`；本文件只订这一路，原样转发 payload。
 * 不是 AppEvent。禁止再 listen 自造 `window/drag`。禁止几何换算。
 */

import { getCurrentWebview, type DragDropEvent } from "@tauri-apps/api/webview";
import type { UnlistenFn } from "@tauri-apps/api/event";

/** 官方 `onDragDropEvent` 负载。`position` 仍是物理点。 */
export type NativeDragDropEvent = DragDropEvent;

export function onNativeDragDrop(handler: (event: NativeDragDropEvent) => void): Promise<UnlistenFn> {
  return getCurrentWebview().onDragDropEvent((event) => {
    handler(event.payload);
  });
}
