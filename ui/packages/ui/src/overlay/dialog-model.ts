/**
 * 对话框领域模型（L2）。
 * 盒、内容区排列/溢出/垫、铬/滚槽分区、操作区 AUTO 是不变式；不碰 DOM、不入栈、不抢焦点。
 *
 * 盒对照：
 * - 鸿蒙 bindSheet / center popup：FIT_CONTENT 随内容，超过帽用帽
 * - Fluent Dialog：Surface hug + maxHeight；Header/Footer 钉住，滚槽只在 Body
 * - ArkUI CloseDialogAnimation：关窗 = 最后一盒上 opacity + scale，FillMode FORWARDS，不改子树固有高
 * - 0fr/1fr Collapse 只在高度不确定的流里成立；确定高 flex 剩余轨里 1fr = 剩余高，收回会把盒归零
 * - fit 走 used-clip：盒高交给公开 YoTravel 当拍锁用后 px；名单走 YoReveal；主槽 clip
 * - 滚条走公开 YoScroller，不是 travel。无法滚动不画条
 *
 * 尺寸策略只认有没有显式高（fit | fill），与 open 正交。
 * 关窗只锁最后打开盒（inline + data-locked），禁止第三种 kind 去改内容区 flex。
 */

export type YoDialogBodyLayout = "stack" | "row";
export type YoDialogBodyOverflow = "auto" | "hidden";
export type YoDialogBodyPad = "lg" | "none";
/** auto = 首个未 skip 的可聚焦；footer = 页脚第一钮（破坏性确认）。 */
export type YoDialogInitial = "auto" | "footer";
/** fit = hug；fill = 显式高。关窗不改 kind。 */
export type DialogBoxKind = "fit" | "fill";
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

/** 缺省 = 纵向叠放 + padding-lg + overflow=auto（只裁切视口槽；滚轴由调用方组合 YoScroller）。 */
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
  locked: boolean;
  sized: boolean;
  style: { width?: string; height?: string };
}

function dialogSizeStyle(width?: number, height?: number): DialogBoxPaint["style"] {
  return {
    ...(width !== undefined ? { width: `${width}px` } : {}),
    ...(height !== undefined ? { height: `${height}px` } : {}),
  };
}

/** 无显式高 = hug。hug 才外包 YoTravel（开窗插值、关窗冻锁）。fill 定高不套 Travel。 */
export function dialogHugsContent(height?: number): boolean {
  return height === undefined;
}

/**
 * 尺寸策略只看显式高。关窗只锁盒，kind 不变。
 * fill 内容区始终吃剩余高；fit 内容区始终 hug。禁止用第三种 kind 改 flex。
 */
export function resolveDialogBox(input: DialogBoxInput): DialogBoxPaint {
  const sized = input.width !== undefined;
  const kind: DialogBoxKind = input.height !== undefined ? "fill" : "fit";
  const locked = !input.open;
  const style = locked
    ? (input.lastOpen ?? dialogSizeStyle(input.width, input.height))
    : dialogSizeStyle(input.width, input.height);
  return { kind, locked, sized, style };
}

/** 正宽高才锁；0 盒（未布局 / jsdom）不写 inline，避免出场折成一条线。 */
export function resolveDialogExitLock(width: number, height: number): DialogBoxLock | undefined {
  if (width <= 0 || height <= 0) return undefined;
  return { width: `${width}px`, height: `${height}px` };
}
