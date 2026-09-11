/**
 * 面板领域模型（L2）。
 * card / pane 同一套铬；内边距缺省跟变体走。
 * 内容区排布是公开契约，不碰 DOM、不判定顶栏形态。
 */

export type YoPanelVariant = "card" | "pane";
export type YoPanelPadding = "none" | "xs" | "sm" | "md" | "lg" | "xl";
export type YoPanelAlign = "stretch" | "start" | "center" | "end";
export type YoPanelGap = "none" | "2xs" | "xs" | "sm" | "md" | "lg" | "xl";
export type YoPanelOverflow = "auto" | "hidden" | "visible";

export const PANEL_VARIANTS = ["card", "pane"] as const;
export const PANEL_PADDINGS = ["none", "xs", "sm", "md", "lg", "xl"] as const;
export const PANEL_ALIGNS = ["stretch", "start", "center", "end"] as const;
export const PANEL_GAPS = ["none", "2xs", "xs", "sm", "md", "lg", "xl"] as const;
export const PANEL_OVERFLOWS = ["auto", "hidden", "visible"] as const;

export const DEFAULT_PANEL_VARIANT: YoPanelVariant = "card";
export const DEFAULT_PANEL_ALIGN: YoPanelAlign = "stretch";
export const DEFAULT_PANEL_GAP: YoPanelGap = "none";

export interface PanelInput {
  variant?: YoPanelVariant;
  padding?: YoPanelPadding;
  paddingBlock?: YoPanelPadding;
  align?: YoPanelAlign;
  gap?: YoPanelGap;
  overflow?: YoPanelOverflow;
  overflowX?: YoPanelOverflow;
}

export interface PanelSpec {
  variant: YoPanelVariant;
  padding: YoPanelPadding;
  paddingBlock: YoPanelPadding | null;
  align: YoPanelAlign;
  gap: YoPanelGap;
  overflow: YoPanelOverflow;
  overflowX: YoPanelOverflow;
}

/** pane 撑满分区，默认不垫；card hug 内容，默认 md。 */
export function defaultPanelPadding(variant: YoPanelVariant): YoPanelPadding {
  return variant === "pane" ? "none" : "md";
}

/** pane 内容区可滚；card 不裁、不另起滚动。 */
export function defaultPanelOverflow(variant: YoPanelVariant): YoPanelOverflow {
  return variant === "pane" ? "auto" : "visible";
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
    overflowX: input.overflowX ?? overflow,
  };
}
