/**
 * 面板领域模型（L2）。
 * card / pane 同一套铬；内边距缺省跟变体走。
 * 不碰 DOM、不判定顶栏形态。
 */

export type YoPanelVariant = "card" | "pane";
export type YoPanelPadding = "none" | "xs" | "sm" | "md" | "lg" | "xl";

export const PANEL_VARIANTS = ["card", "pane"] as const;
export const PANEL_PADDINGS = ["none", "xs", "sm", "md", "lg", "xl"] as const;

export const DEFAULT_PANEL_VARIANT: YoPanelVariant = "card";

export interface PanelInput {
  variant?: YoPanelVariant;
  padding?: YoPanelPadding;
}

export interface PanelSpec {
  variant: YoPanelVariant;
  padding: YoPanelPadding;
}

/** pane 撑满分区，默认不垫；card hug 内容，默认 md。 */
export function defaultPanelPadding(variant: YoPanelVariant): YoPanelPadding {
  return variant === "pane" ? "none" : "md";
}

export function resolvePanelSpec(input: PanelInput): PanelSpec {
  const variant = input.variant ?? DEFAULT_PANEL_VARIANT;
  return {
    variant,
    padding: input.padding ?? defaultPanelPadding(variant),
  };
}
