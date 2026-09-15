/**
 * 对话框领域模型（L2）。
 * 开闭值、面板尺寸、内容区排列是不变式；不碰 DOM、不入栈、不抢焦点。
 */

export type YoDialogBodyLayout = "stack" | "row";
export type YoDialogBodyOverflow = "auto" | "hidden";
export type YoDialogBodyPad = "lg" | "none";
/** auto = 首个未 skip 的可聚焦；footer = 页脚第一钮（破坏性确认）。 */
export type YoDialogInitial = "auto" | "footer";

export const DEFAULT_DIALOG_BODY_LAYOUT: YoDialogBodyLayout = "stack";
export const DEFAULT_DIALOG_BODY_OVERFLOW: YoDialogBodyOverflow = "auto";
export const DEFAULT_DIALOG_BODY_PAD: YoDialogBodyPad = "lg";
export const DEFAULT_DIALOG_INITIAL: YoDialogInitial = "auto";

/** 未写或未知值归一成 auto。禁止第二套首焦别名。 */
export function resolveDialogInitial(value?: string): YoDialogInitial {
  return value === "footer" ? "footer" : DEFAULT_DIALOG_INITIAL;
}

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

/** 缺省 = 今日内容区：纵向叠放 + padding-lg + 内容区自滚动（弹窗唯一滚轴）。 */
export function resolveDialogBodySpec(input: DialogBodyInput): DialogBodySpec {
  return {
    layout: input.layout ?? DEFAULT_DIALOG_BODY_LAYOUT,
    overflow: input.overflow ?? DEFAULT_DIALOG_BODY_OVERFLOW,
    pad: input.pad ?? DEFAULT_DIALOG_BODY_PAD,
  };
}

export interface DialogPanelPaint {
  sized: boolean;
  fill: boolean;
  style: { width?: string; height?: string };
}

/** 出场锁：最后一次打开盒的边框尺寸。零盒不算。 */
export type DialogExitLock = { width: string; height: string };

/** 未写宽高不占 sized/fill；显式 px 才写 inline。禁止第二套 max-width 别名。 */
export function dialogPanelPaint(width?: number, height?: number): DialogPanelPaint {
  return {
    sized: width !== undefined,
    fill: height !== undefined,
    style: {
      ...(width !== undefined ? { width: `${width}px` } : {}),
      ...(height !== undefined ? { height: `${height}px` } : {}),
    },
  };
}

/** 正宽高才锁；0 盒（未布局 / jsdom）不写 inline，避免出场折成一条线。 */
export function resolveDialogExitLock(width: number, height: number): DialogExitLock | undefined {
  if (width <= 0 || height <= 0) return undefined;
  return { width: `${width}px`, height: `${height}px` };
}

/** 出场锁盖过 hug / 显式尺寸。sized/fill 仍认 props，不因锁改 data。 */
export function mergeDialogPanelStyle(
  paint: DialogPanelPaint,
  exitLock?: DialogExitLock,
): DialogPanelPaint["style"] {
  return exitLock ?? paint.style;
}
