/**
 * 图标按钮领域模型（L2）。
 * 尺寸是不变式；透明铬不是 YoButton 的 variant。
 * 不碰 DOM、不判定 disabled / loading / pressed。
 */

export type YoIconButtonSize = "sm" | "md";
export type IconButtonContentKind = "icon" | "slot";

export const ICON_BUTTON_SIZES = ["sm", "md"] as const;
export const DEFAULT_ICON_BUTTON_SIZE: YoIconButtonSize = "md";

export interface IconButtonInput {
  size?: YoIconButtonSize;
  hasIcon?: boolean;
  hasSlot?: boolean;
}

export interface IconButtonSpec {
  size: YoIconButtonSize;
  content: IconButtonContentKind;
}

/** 有自定义内容区就走 slot，否则走具名图标。 */
export function resolveIconButtonSpec(input: IconButtonInput): IconButtonSpec {
  return {
    size: input.size ?? DEFAULT_ICON_BUTTON_SIZE,
    content: input.hasSlot ? "slot" : "icon",
  };
}

/** 内容区必须有具名图标或 slot，禁止空钮。 */
export function iconButtonContentOk(input: IconButtonInput): boolean {
  return Boolean(input.hasSlot || input.hasIcon);
}
