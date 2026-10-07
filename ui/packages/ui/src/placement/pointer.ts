/**
 * 主窗内容坐标（L1）。
 * 拖放事件是物理点；调用方传入 scale，这里换成 CSS 点并判断是否落在矩形内。
 * 文件目录落点与命令库栏命中都调用这一份，禁止再各写一遍。
 */

export interface PointerRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 非正比例当 1。拖放除法与投屏乘法共用，避免 0 把点送出视口。 */
export function positiveScale(scale: number): number {
  return scale > 0 ? scale : 1;
}

/** 主窗设备像素比。0 与 NaN 经 positiveScale 当 1。 */
export function hostPixelRatio(): number {
  return positiveScale(window.devicePixelRatio);
}

/** scale≤0 当 1，避免除零把点送出视口。 */
export function cssPointFromPhysical(
  x: number,
  y: number,
  scale: number,
): { x: number; y: number } {
  const factor = positiveScale(scale);
  return { x: x / factor, y: y / factor };
}

export function rectOf(el: Element): PointerRect {
  const box = el.getBoundingClientRect();
  return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
}

export function pointInRect(rect: PointerRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
