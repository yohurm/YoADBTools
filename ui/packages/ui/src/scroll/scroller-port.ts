/**
 * 同族滚口。YoScroller 提供 view / plane / scrollTop / clientHeight。
 * ReorderList 订这个读祖先视口。禁止 scrape `.yohu-scroller__view`。不进 L5。
 * plane = `.yohu-scroller` 根（不滚、与 view 顶对齐）。overlay 挂 plane，不挂 view。
 */
import { createContext, useContext } from "solid-js";

export type ScrollerPort = {
  view: () => HTMLDivElement | undefined;
  plane: () => HTMLDivElement | undefined;
  scrollTop: () => number;
  clientHeight: () => number;
};

export const ScrollerPortContext = createContext<ScrollerPort | undefined>();

/** 渲染期取祖先滚口。无 YoScroller 时得到 undefined。 */
export function useScrollerPort(): ScrollerPort | undefined {
  return useContext(ScrollerPortContext);
}
