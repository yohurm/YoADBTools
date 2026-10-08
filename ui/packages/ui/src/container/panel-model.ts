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
/**
 * 面板角色。决定底色配方，不决定里面放什么控件。
 * surface = 整块透出外壳。图标轨、表单、预览、编辑器走这档。
 * ops = 操作面板。顶栏留 surface（白），内容区铺 canvas（灰）。这是该角色的固定配方。
 */
export type YoPanelRole = "surface" | "ops";

export const PANEL_VARIANTS = ["card", "pane"] as const;
export const PANEL_PADDINGS = ["none", "xs", "sm", "md", "lg", "xl"] as const;
export const PANEL_ALIGNS = ["stretch", "start", "center", "end"] as const;
export const PANEL_GAPS = ["none", "2xs", "xs", "sm", "md", "lg", "xl"] as const;
export const PANEL_OVERFLOWS = ["hidden", "visible"] as const;
export const PANEL_EDGES = ["none", "drop"] as const;
export const PANEL_ROLES = ["surface", "ops"] as const;

export const DEFAULT_PANEL_VARIANT: YoPanelVariant = "card";
export const DEFAULT_PANEL_ALIGN: YoPanelAlign = "stretch";
export const DEFAULT_PANEL_GAP: YoPanelGap = "none";
export const DEFAULT_PANEL_EDGE: YoPanelEdge = "none";
export const DEFAULT_PANEL_ROLE: YoPanelRole = "surface";

export interface PanelInput {
  variant?: YoPanelVariant;
  padding?: YoPanelPadding;
  paddingBlock?: YoPanelPadding;
  align?: YoPanelAlign;
  gap?: YoPanelGap;
  overflow?: YoPanelOverflow;
  edge?: YoPanelEdge;
  role?: YoPanelRole;
}

export interface PanelSpec {
  variant: YoPanelVariant;
  padding: YoPanelPadding;
  paddingBlock: YoPanelPadding | null;
  align: YoPanelAlign;
  gap: YoPanelGap;
  overflow: YoPanelOverflow;
  edge: YoPanelEdge;
  role: YoPanelRole;
}

/** 分区。内边距、裁切和顶栏行都认这一把。 */
export function panelVariantIsPane(variant?: string): boolean {
  return variant === "pane";
}

/** 卡片。只出标题，不因操作出顶栏。 */
export function panelVariantIsCard(variant?: string): boolean {
  return variant === "card";
}

/** 操作面板。内容区铺 canvas，顶栏仍是 surface。 */
export function panelRoleIsOps(role?: string): boolean {
  return role === "ops";
}

/** 盒外虚线。缺省 none 不写 data-edge。 */
export function panelEdgeIsDrop(edge?: string): boolean {
  return edge === "drop";
}

/** 拖放热态写成 drop，冷态不写 edge。 */
export function panelHotEdge(hot: boolean): "drop" | undefined {
  return hot ? "drop" : undefined;
}

/** pane 撑满分区，默认不垫；card hug 内容，默认 md。 */
export function defaultPanelPadding(variant: YoPanelVariant): YoPanelPadding {
  return panelVariantIsPane(variant) ? "none" : "md";
}

/** pane 只裁切，滚轴由调用方组合 YoScroller；card 不裁、不另起滚动。 */
export function defaultPanelOverflow(variant: YoPanelVariant): YoPanelOverflow {
  return panelVariantIsPane(variant) ? "hidden" : "visible";
}

export function resolvePanelEdge(edge?: YoPanelEdge): YoPanelEdge {
  return edge ?? DEFAULT_PANEL_EDGE;
}

/** 缺省 surface。操作面板才把内容区收成灰井，顶栏仍白。 */
export function resolvePanelRole(role?: YoPanelRole): YoPanelRole {
  return panelRoleIsOps(role) ? "ops" : DEFAULT_PANEL_ROLE;
}

/** drop：盒外空隙 Xs，虚线宽 Accent；中心线 = 空隙 + 半宽。 */
export function resolvePanelEdgeOutset(edge: YoPanelEdge): number {
  return panelEdgeIsDrop(edge) ? Spacing.Xs + Stroke.Accent / 2 : 0;
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
    edge: resolvePanelEdge(input.edge),
    role: resolvePanelRole(input.role),
  };
}
