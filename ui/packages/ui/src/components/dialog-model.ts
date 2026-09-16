/**
 * 对话框领域模型（L2）。
 * 盒、内容区排列/溢出/垫、铬/滚槽分区、操作区 AUTO 是不变式；不碰 DOM、不入栈、不抢焦点。
 *
 * 盒对照：
 * - 鸿蒙 bindSheet / center popup：FIT_CONTENT 随内容，超过帽用帽（API 23 以下不够帽则自适应）
 * - Fluent Dialog：Surface hug + maxHeight；Header/Footer 钉住，Body 才是滚轴
 * - 0fr/1fr Collapse 只在高度不确定的流里成立；确定高 flex 剩余轨里 1fr = 剩余高，收回会把盒归零
 * - fit 走 used-clip：盒高交给公开 YoTravel 当拍锁用后 px；名单走 YoReveal；主槽 clip
 * - 滚条走公开 YoScroller，不是 travel。无法滚动不画条
 * - 关窗锁最后打开盒；内容区保持 fit hug，不改 fill-flex
 */

export type YoDialogBodyLayout = "stack" | "row";
export type YoDialogBodyOverflow = "auto" | "hidden";
export type YoDialogBodyPad = "lg" | "none";
/** auto = 首个未 skip 的可聚焦；footer = 页脚第一钮（破坏性确认）。 */
export type YoDialogInitial = "auto" | "footer";
/** fit = hug；fill = 显式高；exit = 锁最后打开盒。 */
export type DialogBoxKind = "fit" | "fill" | "exit";
/** plain = 子树即滚槽；split = lead / main / tail，只有 main 滚。 */
export type DialogBodyRegion = "plain" | "split";
/**
 * 操作区对照 HarmonyOS DialogButtonDirection.AUTO：
 * ≤1 居中 hug；2 左右铺满；≥3 从下至上（左→下，右→上）。
 */
export type DialogActionsLayout = "center" | "row" | "stack";

export const DEFAULT_DIALOG_BODY_LAYOUT: YoDialogBodyLayout = "stack";
export const DEFAULT_DIALOG_BODY_OVERFLOW: YoDialogBodyOverflow = "auto";
export const DEFAULT_DIALOG_BODY_PAD: YoDialogBodyPad = "lg";
export const DEFAULT_DIALOG_INITIAL: YoDialogInitial = "auto";
export const DEFAULT_DIALOG_BODY_REGION: DialogBodyRegion = "plain";

/** 未写或未知值归一成 auto。禁止第二套首焦别名。 */
export function resolveDialogInitial(value?: string): YoDialogInitial {
  return value === "footer" ? "footer" : DEFAULT_DIALOG_INITIAL;
}

/** 只数操作钮。页脚里的错误字不进 AUTO。 */
export function resolveDialogActionsLayout(count: number): DialogActionsLayout {
  if (count <= 1) return "center";
  if (count === 2) return "row";
  return "stack";
}

export interface DialogBodyInput {
  layout?: YoDialogBodyLayout;
  overflow?: YoDialogBodyOverflow;
  pad?: YoDialogBodyPad;
  lead?: boolean;
  tail?: boolean;
}

export interface DialogBodySpec {
  layout: YoDialogBodyLayout;
  overflow: YoDialogBodyOverflow;
  pad: YoDialogBodyPad;
  region: DialogBodyRegion;
}

/** 有 lead 或 tail 才 split。Collapse 只许进 main。 */
export function resolveDialogBodyRegion(lead?: boolean, tail?: boolean): DialogBodyRegion {
  return lead || tail ? "split" : DEFAULT_DIALOG_BODY_REGION;
}

/** 缺省 = 今日内容区：纵向叠放 + padding-lg + 内容区自滚动（弹窗唯一滚轴）。 */
export function resolveDialogBodySpec(input: DialogBodyInput): DialogBodySpec {
  return {
    layout: input.layout ?? DEFAULT_DIALOG_BODY_LAYOUT,
    overflow: input.overflow ?? DEFAULT_DIALOG_BODY_OVERFLOW,
    pad: input.pad ?? DEFAULT_DIALOG_BODY_PAD,
    region: resolveDialogBodyRegion(input.lead, input.tail),
  };
}

/** 出场锁：最后一次打开盒的边框尺寸。零盒不算。 */
export type DialogBoxLock = { width: string; height: string };

export interface DialogBoxInput {
  width?: number;
  height?: number;
  open: boolean;
  lastOpen?: DialogBoxLock;
}

export interface DialogBoxPaint {
  kind: DialogBoxKind;
  sized: boolean;
  style: { width?: string; height?: string };
}

function dialogSizeStyle(width?: number, height?: number): DialogBoxPaint["style"] {
  return {
    ...(width !== undefined ? { width: `${width}px` } : {}),
    ...(height !== undefined ? { height: `${height}px` } : {}),
  };
}

/**
 * 打开：显式高 = fill，否则 fit（hug，滚槽自有预算）。
 * 关闭：有最后打开盒才 exit。hug 冻到 Presence 卸节点；内容区不改 fill-flex。
 */
export function resolveDialogBox(input: DialogBoxInput): DialogBoxPaint {
  const sized = input.width !== undefined;
  if (!input.open) {
    return {
      kind: "exit",
      sized,
      style: input.lastOpen ?? dialogSizeStyle(input.width, input.height),
    };
  }
  if (input.height !== undefined) {
    return { kind: "fill", sized, style: dialogSizeStyle(input.width, input.height) };
  }
  return { kind: "fit", sized, style: dialogSizeStyle(input.width) };
}

/** 正宽高才锁；0 盒（未布局 / jsdom）不写 inline，避免出场折成一条线。 */
export function resolveDialogExitLock(width: number, height: number): DialogBoxLock | undefined {
  if (width <= 0 || height <= 0) return undefined;
  return { width: `${width}px`, height: `${height}px` };
}

