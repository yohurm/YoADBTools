/**
 * 窗口级拖放订阅。负载是壳已收成 CSS 点的单一 DTO，本文件只原样转发。
 */

import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** 与 yohu-protocol::event_names::WINDOW_DRAG 对齐。 */
export const NATIVE_DRAG_EVENT = "window/drag";

/** wry 拖放经壳 `scale_factor` 换成 CSS 像素，供 `elementFromPoint`。 */
export type NativeDragDropEvent =
  | { type: "enter"; paths: string[]; x: number; y: number }
  | { type: "over"; x: number; y: number }
  | { type: "drop"; paths: string[]; x: number; y: number }
  | { type: "leave" };

export function onNativeDragDrop(handler: (event: NativeDragDropEvent) => void): Promise<UnlistenFn> {
  return listen<NativeDragDropEvent>(NATIVE_DRAG_EVENT, (event) => {
    handler(event.payload);
  });
}
