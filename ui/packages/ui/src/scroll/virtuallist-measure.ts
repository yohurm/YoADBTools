/**
 * 虚拟列表视口测量（L3）。
 * 读盒；内容宽代数仍走 virtuallist-model。L4 不 getComputedStyle。
 */

import { virtualContentWidth } from "./virtuallist-model";

/** 视口内容盒宽：clientWidth 减 paddingInline，不进侧轨。无节点为 0。 */
export function measureVirtualViewContentWidth(el: HTMLElement | undefined | null): number {
  if (!el) return 0;
  const style = getComputedStyle(el);
  const pad =
    (Number.parseFloat(style.paddingInlineStart) || 0) +
    (Number.parseFloat(style.paddingInlineEnd) || 0);
  return virtualContentWidth(el.clientWidth, pad);
}
