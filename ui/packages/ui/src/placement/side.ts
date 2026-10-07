/** 锚点上下落点。菜单、气泡和下拉布局都认这一份。 */
export type PopoverPlacement = "bottom" | "top";

/** 向下展开。气泡和菜单的落点、可用高度都认这一把。 */
export function placementIsBottom(placement: PopoverPlacement): boolean {
  return placement === "bottom";
}
