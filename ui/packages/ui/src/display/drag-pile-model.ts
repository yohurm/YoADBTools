/**
 * 多选拖动预览（L2）。
 * 跟指针时主预览在前，其后两张 0.6/+8°、0.3/−8°，再往后的牌叠在下面但先不画出来。
 * 每张牌的布局盒是它自己的行。松开由 playGatherRelease 按行序错开起步，飞行重叠。
 * 不认识命令、组、选中底。
 */

export const GATHER_BACK_CAP = 2;

/** ArkUI `PIXELMAP_DRAG_SCALE_MULTIPLE`。 */
export const GATHER_LIFT_SCALE = 1.05;

/** ArkUI 第一张、第二张子预览。 */
const GATHER_BACKS = [
  { opacity: 0.6, angle: 8 },
  { opacity: 0.3, angle: -8 },
] as const;

export type DragPilePhase = "carry" | "home" | "drop";

export interface GatherPaint {
  opacity: number;
  angle: number;
}

const PHASES: readonly DragPilePhase[] = ["carry", "home", "drop"];

export function resolveDragPilePhase(phase: string | undefined): DragPilePhase {
  if (phase && (PHASES as readonly string[]).includes(phase)) return phase as DragPilePhase;
  return "carry";
}

/** 跟指针时看得见的张数：主预览 + 最多两张子预览。其余仍在树上，松开才飞出。 */
export function gatherShownCount(faceCount: number): number {
  if (faceCount <= 0) return 0;
  return Math.min(faceCount, 1 + GATHER_BACK_CAP);
}

/** 第 0 张是主预览。超出两张子预览的牌透明，留给松开时再出现。 */
export function gatherPaint(slot: number): GatherPaint {
  if (slot <= 0) return { opacity: 1, angle: 0 };
  return GATHER_BACKS[slot - 1] ?? { opacity: 0, angle: 0 };
}

export function gatherScale(phase: DragPilePhase): number {
  return phase === "carry" ? GATHER_LIFT_SCALE : 1;
}

/** 两条及以上才在主预览角上写总数。 */
export function dragPileShowsCount(count: number): boolean {
  return count > 1;
}
