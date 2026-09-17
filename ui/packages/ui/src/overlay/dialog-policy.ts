/**
 * 对话框策略门面（L3）。
 * 栈与焦点陷阱已在 dialog-stack / dialog-focus；本文件只装配 attach、开闭读取与内容区 / 操作区 data-*。
 * 禁止另起一套 Modal.confirm / 第二套 keydown。
 */

import type { Accessor } from "solid-js";

import { dialogInitialFocus } from "./dialog-focus";
import {
  resolveDialogActionsLayout,
  resolveDialogBodySpec,
  resolveDialogExitLock,
  type DialogActionsLayout,
  type DialogBodyInput,
  type DialogBoxLock,
  type DialogBodyRegion,
  type YoDialogBodyLayout,
  type YoDialogBodyOverflow,
  type YoDialogBodyPad,
} from "./dialog-model";
import { popDialog, pushDialog, type DialogStackEntry } from "./dialog-stack";
import { overlayLayerStyle } from "./popover-place";
import { dismissTooltipOverlay } from "./tooltip-policy";

export type { DialogStackEntry };
export { dialogFocusables, dialogInitialFocus, dialogTabTarget } from "./dialog-focus";
export { popDialog, pushDialog } from "./dialog-stack";

export function resolveDialogOpen(open: boolean | Accessor<boolean>): boolean {
  return typeof open === "function" ? open() : open;
}

export function dialogLayerStyle(): Record<string, string> {
  return overlayLayerStyle("dialog");
}

export interface DialogBodyAttrs {
  "data-layout": YoDialogBodyLayout;
  "data-overflow": YoDialogBodyOverflow;
  "data-pad": YoDialogBodyPad;
  "data-region": DialogBodyRegion;
}

/** 内容区契约写成 data-*；CSS 只认这些名字，禁止模块 :has 穿皮。 */
export function dialogBodyAttrs(input: DialogBodyInput): DialogBodyAttrs {
  const spec = resolveDialogBodySpec(input);
  return {
    "data-layout": spec.layout,
    "data-overflow": spec.overflow,
    "data-pad": spec.pad,
    "data-region": spec.region,
  };
}

export interface DialogActionsAttrs {
  "data-layout": DialogActionsLayout;
}

/**
 * 只数页脚 `button` 槽。不认 Button 类名，不穿 chrome。
 * 容器走直接子节点；装配面走 children 列表。
 */
export function countDialogActions(source: ParentNode | ArrayLike<unknown>): number {
  const nodes = source instanceof Node ? source.children : source;
  let count = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node instanceof HTMLButtonElement) {
      count += 1;
    }
  }
  return count;
}

/** 操作区 AUTO 写成 data-layout；CSS 只认 center | row | stack。 */
export function dialogActionsAttrs(count: number): DialogActionsAttrs {
  return { "data-layout": resolveDialogActionsLayout(count) };
}

/** 读打开盒：面板 offset 布局宽高。零盒不锁。禁止 scrape Travel。 */
export function dialogExitLock(panel: HTMLElement): DialogBoxLock | undefined {
  return resolveDialogExitLock(panel.offsetWidth, panel.offsetHeight);
}

/** 入栈：先卸轻浮层，再在微任务里把焦点送进面板。返回 detach（出栈）。 */
export function attachDialog(entry: DialogStackEntry): () => void {
  dismissTooltipOverlay();
  pushDialog(entry);
  queueMicrotask(() => {
    const panel = entry.getPanel();
    if (!panel) return;
    dialogInitialFocus(panel, entry.initial).focus();
  });
  return () => {
    popDialog(entry);
  };
}
