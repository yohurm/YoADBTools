/**
 * Gather 松开（L2）。
 * ArkUI 给每个选中子节点记下自己的原点，松开时回到那个原点。
 * 桌面上看成「整沓一起淡掉」是因为只画了影子、又整沓透明。
 * 这里每张牌的布局盒就是它自己的行。松开按行从上到下错开起步，
 * 下一张不等上一张飞完，飞行彼此重叠。
 */

import { listEdgeIndex } from "../keymap/list-index";
import { MotionEasing, MotionSpec, motionDurationMs, motionSpecMs, type MotionSpecName } from "../tokens/motion";
import { shouldSkipMotion } from "../motion/reduced";

export interface GatherPoint {
  x: number;
  y: number;
}

export interface GatherReleaseSlot {
  index: number;
  originX: number;
  originY: number;
}

export function gatherReleaseOrder(slots: readonly GatherReleaseSlot[]): number[] {
  return slots
    .map((slot) => ({ index: slot.index, x: slot.originX, y: slot.originY }))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.index - b.index)
    .map((slot) => slot.index);
}

/** 牌的布局盒钉在自己的行上，跟指针时用平移把牌拉到叠层。 */
export function gatherStackTransform(origin: GatherPoint, stack: GatherPoint, angle: number, scale: number): string {
  const dx = stack.x - origin.x;
  const dy = stack.y - origin.y;
  return `translate(${dx}px, ${dy}px) rotate(${angle}deg) scale(${scale})`;
}

export function gatherHomeTransform(): string {
  return "translate(0px, 0px) rotate(0deg) scale(1)";
}

export function gatherDropTransform(origin: GatherPoint, dropAt: GatherPoint): string {
  return gatherStackTransform(origin, dropAt, 0, 1);
}

export interface GatherPlate {
  el: HTMLElement;
  id: string;
  originX: number;
  originY: number;
}

/** 下一张比上一张晚一个 effectsFast 起步，飞行仍是 spatialLocal，彼此重叠。 */
export function gatherReleaseStartMs(rank: number): number {
  return Math.max(0, rank) * motionSpecMs("effectsFast");
}

/** 从第一张起步到最后一张淡出结束。卸载超时与这段对齐。 */
export function gatherHomeSpan(count: number): number {
  if (count <= 0) return 0;
  return gatherReleaseStartMs(listEdgeIndex(count, "end")) + motionSpecMs("spatialLocal") + motionSpecMs("effectsExit");
}

function timing(spec: MotionSpecName, delay = 0): KeyframeAnimationOptions {
  const motion = MotionSpec[spec];
  return {
    duration: motionDurationMs(motion.duration),
    easing: MotionEasing[motion.easing],
    delay,
    fill: "both",
  };
}

function currentTransform(el: HTMLElement): string {
  return el.style.transform || getComputedStyle(el).transform || gatherHomeTransform();
}

function currentOpacity(el: HTMLElement): string {
  if (el.style.opacity) return el.style.opacity;
  const read = getComputedStyle(el).opacity;
  return read || "1";
}

function applyEnd(el: HTMLElement, frames: Keyframe[]): void {
  const to = frames[frames.length - 1];
  if (!to || typeof to !== "object") return;
  if (typeof to.transform === "string") el.style.transform = to.transform;
  if (typeof to.opacity === "string" || typeof to.opacity === "number") el.style.opacity = String(to.opacity);
}

async function runFrames(el: HTMLElement, frames: Keyframe[], spec: MotionSpecName, delay = 0): Promise<void> {
  if (shouldSkipMotion() || typeof el.animate !== "function") {
    applyEnd(el, frames);
    return;
  }
  const animation = el.animate(frames, timing(spec, delay));
  try {
    await animation.finished;
  } catch {
    animation.cancel();
  }
  applyEnd(el, frames);
}

async function flyTo(el: HTMLElement, transform: string, opacity: string, delay = 0): Promise<void> {
  const fromTransform = currentTransform(el);
  const fromOpacity = currentOpacity(el);
  await runFrames(
    el,
    [
      { transform: fromTransform, opacity: fromOpacity },
      { transform, opacity },
    ],
    "spatialLocal",
    delay,
  );
}

async function dissolve(el: HTMLElement): Promise<void> {
  await runFrames(
    el,
    [
      { opacity: currentOpacity(el) },
      { opacity: "0" },
    ],
    "effectsExit",
  );
}

/**
 * home：按行序错开起步，每张飞回自己的布局盒后淡出。下一张不等上一张结束。
 * drop：整批同时飞到同一个落点。
 */
export async function playGatherRelease(input: {
  plates: readonly GatherPlate[];
  mode: "home" | "drop";
  dropAt?: GatherPoint;
  onArrive?: (id: string) => void;
  aborted?: () => boolean;
}): Promise<void> {
  const { plates, mode } = input;
  if (plates.length === 0 || input.aborted?.()) return;
  const order =
    mode === "home"
      ? gatherReleaseOrder(
          plates.map((plate, index) => ({
            index,
            originX: plate.originX,
            originY: plate.originY,
          })),
        )
      : plates.map((_, index) => index);

  if (mode === "drop") {
    const dropAt = input.dropAt ?? { x: plates[0]?.originX ?? 0, y: plates[0]?.originY ?? 0 };
    await Promise.all(
      order.map(async (index) => {
        const plate = plates[index];
        if (!plate || input.aborted?.()) return;
        plate.el.style.zIndex = String(40 - index);
        await flyTo(plate.el, gatherDropTransform({ x: plate.originX, y: plate.originY }, dropAt), "1");
      }),
    );
    return;
  }

  await Promise.all(
    order.map(async (index, rank) => {
      const plate = plates[index];
      if (!plate || input.aborted?.()) return;
      plate.el.style.zIndex = String(80 + order.length - rank);
      await flyTo(plate.el, gatherHomeTransform(), "1", gatherReleaseStartMs(rank));
      if (input.aborted?.()) return;
      input.onArrive?.(plate.id);
      await dissolve(plate.el);
    }),
  );
}
