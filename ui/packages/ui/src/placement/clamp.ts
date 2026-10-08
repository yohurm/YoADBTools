/**
 * 视口夹紧（L1）。
 * 原点加上尺寸必须落在 [0, limit] 内。尺寸大于视口时原点为 0。
 * 右键菜单点夹紧与浮层左缘共用这一份。气泡贴边留白不走这里。
 */

function spanExtent(value: number): number {
  return Math.max(0, value);
}

export function clampSpan(origin: number, size: number, limit: number): number {
  const span = spanExtent(size);
  return Math.min(spanExtent(origin), spanExtent(limit - span));
}

export function clampToRect(
  x: number,
  y: number,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: clampSpan(x, size.width, viewport.width),
    y: clampSpan(y, size.height, viewport.height),
  };
}
