/**
 * 浮层叠层（单位：无）。Dialog < Overlay（Select / Tooltip / 菜单）< Toast。
 * 禁止组件再写 1000 / 1050 / 1100 / 9999。
 */
export const ZIndex = {
  Dialog: 1000,
  Overlay: 1050,
  Toast: 1100,
} as const;
