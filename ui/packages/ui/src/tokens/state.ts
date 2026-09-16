/**
 * 交互态填充与选中片几何（UI设计系统-v6.md §2.7）。
 * 唯一配方：hover/pressed 中性叠色；选中 = interactive_select（品牌 20% + 正文色）。
 * 禁止表面另写选中底或选中字色。实心底留给按钮 / 开关，不进列表选中。
 */

export const StateFill = {
  Hover: "#0000000C",
  Pressed: "#00000019",
  Selected: "var(--yohu-accent-soft)",
  SelectedFg: "var(--yohu-fg)",
} as const;

export const DarkStateFill = {
  Hover: "#FFFFFF0C",
  Pressed: "#FFFFFF19",
  Selected: "var(--yohu-accent-soft)",
  SelectedFg: "var(--yohu-fg)",
} as const;

/** 换位源行占位。L1 换位行铬消费 `--yohu-state-reorder-source`。 */
export const StateOpacity = {
  ReorderSource: "0.32",
} as const;

/**
 * 选中片几何。铺满行盒；距背板由容器 padding 承担，禁止行内再缩。
 */
export const Ripple = {
  Radius: "var(--yohu-radius-sm)",
  Inset: "0",
} as const;
