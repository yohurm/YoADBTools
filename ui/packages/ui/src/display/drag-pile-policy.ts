/**
 * 叠卡宿主属性（L3）。只写阶段，不画扇面。
 */

import type { DragPilePhase } from "./drag-pile-model";

export interface DragPileHostAttrs {
  "data-phase": DragPilePhase;
}

export function dragPileHostAttrs(phase: DragPilePhase): DragPileHostAttrs {
  return { "data-phase": phase };
}
