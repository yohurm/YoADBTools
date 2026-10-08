/**
 * 面板交互策略（L3）。
 * 顶栏形态与宿主 data-* 从模型快照组装。
 * 不写色值、不画铬。
 */

import {
  panelEdgeIsDrop,
  panelRoleIsOps,
  panelVariantIsCard,
  panelVariantIsPane,
  resolvePanelSpec,
  type PanelInput,
  type PanelSpec,
  type YoPanelAlign,
  type YoPanelGap,
  type YoPanelEdge,
  type YoPanelOverflow,
  type YoPanelPadding,
  type YoPanelVariant,
  type YoPanelRole,
} from "./panel-model";

export type PanelHeaderKind = "custom" | "pane" | "card-title" | "none";

/** 顶栏槽有节点。空串与 false 不算。 */
export function panelSlotOn(value: unknown): boolean {
  return Boolean(value);
}

/** 调用方传入的 header 槽。盖过 title / actions。 */
export function panelHeaderIsCustom(kind?: string): boolean {
  return kind === "custom";
}

/** pane 的标题行加操作。 */
export function panelHeaderIsPane(kind?: string): boolean {
  return kind === "pane";
}

/** card 只出标题。 */
export function panelHeaderIsCardTitle(kind?: string): boolean {
  return kind === "card-title";
}

export interface PanelHeaderInput {
  header?: boolean;
  title?: boolean;
  actions?: boolean;
}

/**
 * 自定义 header 盖过 title/actions。
 * pane 才画标题行+操作；card 只画标题，不画 actions。
 */
export function resolvePanelHeaderKind(
  spec: PanelSpec,
  input: PanelHeaderInput,
): PanelHeaderKind {
  if (input.header) return "custom";
  if (panelVariantIsPane(spec.variant) && (input.title || input.actions)) return "pane";
  if (panelVariantIsCard(spec.variant) && input.title) return "card-title";
  return "none";
}

export interface PanelHostAttrs {
  "data-variant": YoPanelVariant;
  "data-padding": YoPanelPadding;
  "data-header": PanelHeaderKind;
  "data-align": YoPanelAlign;
  "data-gap": YoPanelGap;
  "data-overflow": YoPanelOverflow;
  "data-padding-block"?: YoPanelPadding;
  "data-edge"?: YoPanelEdge;
  "data-role"?: Extract<YoPanelRole, "ops">;
}

export function panelHostAttrs(input: PanelInput & PanelHeaderInput): PanelHostAttrs {
  const spec = resolvePanelSpec(input);
  return {
    "data-variant": spec.variant,
    "data-padding": spec.padding,
    "data-header": resolvePanelHeaderKind(spec, input),
    "data-align": spec.align,
    "data-gap": spec.gap,
    "data-overflow": spec.overflow,
    ...(spec.paddingBlock ? { "data-padding-block": spec.paddingBlock } : {}),
    ...(panelEdgeIsDrop(spec.edge) ? { "data-edge": spec.edge } : {}),
    ...(panelRoleIsOps(spec.role) ? { "data-role": "ops" as const } : {}),
  };
}
