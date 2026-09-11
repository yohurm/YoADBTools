/**
 * 面板交互策略（L3）。
 * 顶栏形态与宿主 data-* 从模型快照组装。
 * 不写色值、不画铬。
 */

import {
  resolvePanelSpec,
  type PanelInput,
  type PanelSpec,
  type YoPanelAlign,
  type YoPanelGap,
  type YoPanelOverflow,
  type YoPanelPadding,
  type YoPanelVariant,
} from "./panel-model";

export type PanelHeaderKind = "custom" | "pane" | "card-title" | "none";

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
  if (spec.variant === "pane" && (input.title || input.actions)) return "pane";
  if (spec.variant === "card" && input.title) return "card-title";
  return "none";
}

export interface PanelHostAttrs {
  "data-variant": YoPanelVariant;
  "data-padding": YoPanelPadding;
  "data-header": PanelHeaderKind;
  "data-align": YoPanelAlign;
  "data-gap": YoPanelGap;
  "data-overflow": YoPanelOverflow;
  "data-overflow-x"?: YoPanelOverflow;
  "data-padding-block"?: YoPanelPadding;
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
    ...(spec.overflowX !== spec.overflow ? { "data-overflow-x": spec.overflowX } : {}),
    ...(spec.paddingBlock ? { "data-padding-block": spec.paddingBlock } : {}),
  };
}
