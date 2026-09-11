/**
 * 命令块步骤排序（纯函数）。手势与 DOM 不进本文件。
 */

import type { DraftStep } from "../draft";

export function moveStep(steps: DraftStep[], index: number, delta: number): DraftStep[] {
  return moveStepTo(steps, index, index + delta);
}

/** 把一步挪到目标下标；越界或同位则原数组。 */
export function moveStepTo(steps: DraftStep[], from: number, to: number): DraftStep[] {
  if (from === to || from < 0 || to < 0 || from >= steps.length || to >= steps.length) {
    return steps;
  }
  const copy = steps.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item!);
  return copy;
}

/** 指针 Y 相对各行中线，得到应插入的目标下标。 */
export function dropIndexFromCenters(centers: readonly number[], y: number): number {
  if (centers.length === 0) return 0;
  let to = centers.length - 1;
  for (let i = 0; i < centers.length; i++) {
    if (y < centers[i]!) {
      to = i;
      break;
    }
  }
  return to;
}

/** 拖动预览：夹在 from→to 之间的行让出空位（+1 下移 / -1 上移）。被拖行不走此位移。 */
export function shiftForReorder(index: number, from: number, to: number): number {
  if (index === from) return 0;
  if (from < to && index > from && index <= to) return -1;
  if (from > to && index >= to && index < from) return 1;
  return 0;
}
