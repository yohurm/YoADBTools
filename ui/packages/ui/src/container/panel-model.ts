/**
 * 面板领域模型（L2）。
 * card / pane 同一套铬；内边距缺省跟变体走。
 * 内容区排布是公开契约，不碰 DOM、不判定顶栏形态。
 * edge：none 无外圈；drop 在填充盒外画虚线，不是面板描边。
 */
import { Stroke } from "../tokens/layout";
import { Spacing } from "../tokens/spacing";

export type YoPanelVariant = "card" | "pane";
export type YoPanelPadding = "none" | "xs" | "sm" | "md" | "lg" | "xl";
export type YoPanelAlign = "stretch" | "start" | "center" | "end";
export type YoPanelGap = "none" | "2xs" | "xs" | "sm" | "md" | "lg" | "xl";
export type YoPanelOverflow = "hidden" | "visible";
/** 外壳高光。drop = 填充盒外一圈虚线，不进内容、不占用描边。 */
export type YoPanelEdge = "none" | "drop";

export const PANEL_VARIANTS = ["card", "pane"] as const;
export const PANEL_PADDINGS = ["none", "xs", "sm", "md", "lg", "xl"] as const;
export const PANEL_ALIGNS = ["stretch", "start", "center", "end"] as const;
export const PANEL_GAPS = ["none", "2xs", "xs", "sm", "md", "lg", "xl"] as const;
export const PANEL_OVERFLOWS = ["hidden", "visible"] as const;
export const PANEL_EDGES = ["none", "drop"] as const;

export const DEFAULT_PANEL_VARIANT: YoPanelVariant = "card";
export const DEFAULT_PANEL_ALIGN: YoPanelAlign = "stretch";
export const DEFAULT_PANEL_GAP: YoPanelGap = "none";
export const DEFAULT_PANEL_EDGE: YoPanelEdge = "none";

export interface PanelInput {
  variant?: YoPanelVariant;
  padding?: YoPanelPadding;
  paddingBlock?: YoPanelPadding;
  align?: YoPanelAlign;
  gap?: YoPanelGap;
  overflow?: YoPanelOverflow;
  overflowX?: YoPanelOverflow;
  edge?: YoPanelEdge;
}

export interface PanelSpec {
  variant: YoPanelVariant;
  padding: YoPanelPadding;
  paddingBlock: YoPanelPadding | null;
  align: YoPanelAlign;
  gap: YoPanelGap;
  overflow: YoPanelOverflow;
  overflowX: YoPanelOverflow;
  edge: YoPanelEdge;
}

/** pane 撑满分区，默认不垫；card hug 内容，默认 md。 */
export function defaultPanelPadding(variant: YoPanelVariant): YoPanelPadding {
  return variant === "pane" ? "none" : "md";
}

/** pane 只裁切，滚轴由调用方组合 YoScroller；card 不裁、不另起滚动。 */
export function defaultPanelOverflow(variant: YoPanelVariant): YoPanelOverflow {
  return variant === "pane" ? "hidden" : "visible";
}

/** 横轴缺省跟 overflow。禁止 auto，系统条不进面板。 */
export function defaultPanelOverflowX(overflow: YoPanelOverflow): YoPanelOverflow {
  return overflow;
}

export function resolvePanelEdge(edge?: YoPanelEdge): YoPanelEdge {
  return edge ?? DEFAULT_PANEL_EDGE;
}

/** drop：盒外空隙 Xs，虚线宽 Accent；中心线 = 空隙 + 半宽。 */
export function resolvePanelEdgeOutset(edge: YoPanelEdge): number {
  return edge === "drop" ? Spacing.Xs + Stroke.Accent / 2 : 0;
}

export function resolvePanelSpec(input: PanelInput): PanelSpec {
  const variant = input.variant ?? DEFAULT_PANEL_VARIANT;
  const overflow = input.overflow ?? defaultPanelOverflow(variant);
  return {
    variant,
    padding: input.padding ?? defaultPanelPadding(variant),
    paddingBlock: input.paddingBlock ?? null,
    align: input.align ?? DEFAULT_PANEL_ALIGN,
    gap: input.gap ?? DEFAULT_PANEL_GAP,
    overflow,
    overflowX: input.overflowX ?? defaultPanelOverflowX(overflow),
    edge: resolvePanelEdge(input.edge),
  };
}
