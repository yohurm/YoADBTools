/**
 * 对话框领域模型（L2）。
 * 开闭值、面板尺寸、内容区排列是不变式；不碰 DOM、不入栈、不抢焦点。
 */

export type YoDialogBodyLayout = "stack" | "row";
export type YoDialogBodyOverflow = "auto" | "hidden";
export type YoDialogBodyPad = "lg" | "none";

export const DEFAULT_DIALOG_BODY_LAYOUT: YoDialogBodyLayout = "stack";
export const DEFAULT_DIALOG_BODY_OVERFLOW: YoDialogBodyOverflow = "auto";
export const DEFAULT_DIALOG_BODY_PAD: YoDialogBodyPad = "lg";

export interface DialogBodyInput {
  layout?: YoDialogBodyLayout;
  overflow?: YoDialogBodyOverflow;
  pad?: YoDialogBodyPad;
}

export interface DialogBodySpec {
  layout: YoDialogBodyLayout;
  overflow: YoDialogBodyOverflow;
  pad: YoDialogBodyPad;
}

/** 缺省 = 今日内容区：纵向叠放 + padding-lg + 自滚动。 */
export function resolveDialogBodySpec(input: DialogBodyInput): DialogBodySpec {
  return {
    layout: input.layout ?? DEFAULT_DIALOG_BODY_LAYOUT,
    overflow: input.overflow ?? DEFAULT_DIALOG_BODY_OVERFLOW,
    pad: input.pad ?? DEFAULT_DIALOG_BODY_PAD,
  };
}

export interface DialogPanelPaint {
  sized: boolean;
  style: { width?: string; height?: string };
}

/** 未写宽高不占 sized；显式 px 才写 inline。禁止第二套 max-width 别名。 */
export function dialogPanelPaint(width?: number, height?: number): DialogPanelPaint {
  return {
    sized: width !== undefined,
    style: {
      ...(width !== undefined ? { width: `${width}px` } : {}),
      ...(height !== undefined ? { height: `${height}px` } : {}),
    },
  };
}
