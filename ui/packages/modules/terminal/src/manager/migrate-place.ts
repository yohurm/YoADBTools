/**
 * 迁移气泡在命令管理栏里的落点。
 * 用视口差除掉对话框 scale，写成 .yohu-cm 的布局像素。
 * 不参与组内换位几何。
 */

export interface MigrateBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MigrateRootMetrics {
  left: number;
  top: number;
  width: number;
  height: number;
  offsetWidth: number;
  offsetHeight: number;
}

export interface MigrateLocalPoint {
  x: number;
  y: number;
}

export function readMigrateRoot(el: HTMLElement): MigrateRootMetrics {
  const box = el.getBoundingClientRect();
  return {
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    offsetWidth: el.offsetWidth,
    offsetHeight: el.offsetHeight,
  };
}

/** 视口盒 → 根的布局坐标。scale 为 1 时就是视口差。 */
export function migrateLocalOrigin(root: MigrateRootMetrics, box: MigrateBox): MigrateLocalPoint {
  const scaleX = root.offsetWidth > 0 ? root.width / root.offsetWidth : 1;
  const scaleY = root.offsetHeight > 0 ? root.height / root.offsetHeight : 1;
  return {
    x: (box.left - root.left) / scaleX,
    y: (box.top - root.top) / scaleY,
  };
}

export function migrateLocalPoint(
  root: MigrateRootMetrics,
  clientX: number,
  clientY: number,
): MigrateLocalPoint {
  return migrateLocalOrigin(root, { left: clientX, top: clientY, width: 0, height: 0 });
}

/** 气泡中心贴上目标行中心。 */
export function migrateLanding(
  root: MigrateRootMetrics,
  target: MigrateBox & { offsetWidth: number; offsetHeight: number },
  stack: { offsetWidth: number; offsetHeight: number },
): MigrateLocalPoint {
  const origin = migrateLocalOrigin(root, target);
  return {
    x: origin.x + (target.offsetWidth - stack.offsetWidth) / 2,
    y: origin.y + (target.offsetHeight - stack.offsetHeight) / 2,
  };
}

/** 放回时，行左上角相对预览宿主左上角的位移。 */
export function migrateReturnDelta(host: MigrateLocalPoint, row: MigrateLocalPoint): MigrateLocalPoint {
  return { x: row.x - host.x, y: row.y - host.y };
}

export function findMigrateEntry(root: HTMLElement, id: string): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>(".yohu-cm__entries [data-key]")) {
    if (el.getAttribute("data-key") === id) return el;
  }
  return null;
}

export function findMigrateRow(root: HTMLElement, key: string): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>("[data-key]")) {
    if (el.getAttribute("data-key") === key) return el;
  }
  return null;
}

/** 中栏里还看得见的选中行，作为菜单飞行的起点。 */
export function findMigrateSource(root: HTMLElement, ids: readonly string[]): HTMLElement | null {
  for (const id of ids) {
    const row = findMigrateRow(root, id);
    if (row?.closest(".yohu-cm__entries")) return row;
  }
  return root.querySelector<HTMLElement>("[data-migrate-anchor]");
}

export function migrateHitId(node: Element | null): string | null {
  const row = node?.closest("[data-key]");
  return row?.getAttribute("data-key") ?? null;
}
