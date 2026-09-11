/**
 * 对话框策略门面（L3）。
 * 栈与焦点陷阱已在 dialog-stack / dialog-focus；本文件只装配 attach、开闭读取与内容区 data-*。
 * 禁止另起一套 Modal.confirm / 第二套 keydown。
 */

import type { Accessor } from "solid-js";

import { dialogFocusables } from "./dialog-focus";
import {
  resolveDialogBodySpec,
  type DialogBodyInput,
  type YoDialogBodyLayout,
  type YoDialogBodyOverflow,
  type YoDialogBodyPad,
} from "./dialog-model";
import { popDialog, pushDialog, type DialogStackEntry } from "./dialog-stack";
import { overlayLayerStyle } from "./popover-place";
import { dismissTooltipOverlay } from "./tooltip-policy";

export type { DialogStackEntry };
export { dialogFocusables, dialogTabTarget } from "./dialog-focus";
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
}

/** 内容区契约写成 data-*；CSS 只认这些名字，禁止模块 :has 穿皮。 */
export function dialogBodyAttrs(input: DialogBodyInput): DialogBodyAttrs {
  const spec = resolveDialogBodySpec(input);
  return {
    "data-layout": spec.layout,
    "data-overflow": spec.overflow,
    "data-pad": spec.pad,
  };
}

/** 入栈：先卸轻浮层，再在微任务里把焦点送进面板。返回 detach（出栈）。 */
export function attachDialog(entry: DialogStackEntry): () => void {
  dismissTooltipOverlay();
  pushDialog(entry);
  queueMicrotask(() => {
    const panel = entry.getPanel();
    if (!panel) return;
    const items = dialogFocusables(panel);
    (items[0] ?? panel).focus();
  });
  return () => {
    popDialog(entry);
  };
}
