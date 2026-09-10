/**
 * 右键菜单引擎。
 * 页面只提供场景表（defineContextMenu）与 open 时的 ctx。
 * 壳挂载唯一 YoContextMenuHost；禁止模块再渲染 YoContextMenu。
 *
 * L0 token → L1 Presence/interactive → L2 types + list-model
 * → L3 controller / place / menu-key-policy → L4 Host + YoContextMenu List
 */

export type {
  ContextMenuRequest,
  ContextMenuScene,
  ContextMenuSession,
  YoMenuItem,
} from "./types";
export { clampContextMenuPoint, clampToRect, estimateContextMenuHeight } from "./place";
export {
  closeContextMenu,
  createContextMenuController,
  defineContextMenu,
  openContextMenu,
} from "./controller";
export type { ContextMenuController } from "./controller";
export { YoContextMenuHost } from "./host";
export type { YoContextMenuHostProps } from "./host";
