/**
 * 锚点视口盒（L1）。
 * 下拉与气泡都读触发元素的 top / left / bottom / width / height。
 * 无元素时是零盒。禁止再各写一遍。
 */

export interface AnchorBox {
  top: number;
  left: number;
  bottom: number;
  width: number;
  height: number;
}

export function readAnchorBox(el: Element | undefined): AnchorBox {
  const rect = el?.getBoundingClientRect();
  if (!rect) return { top: 0, left: 0, bottom: 0, width: 0, height: 0 };
  return {
    top: rect.top,
    left: rect.left,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}
