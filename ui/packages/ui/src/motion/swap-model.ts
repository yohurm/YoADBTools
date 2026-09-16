/**
 * 换牌槽位（L2）。
 * 是否跳过、容差、idle/resizing；不碰 DOM、不写宿主属性。
 */

export type SwapAnchor = "start" | "center" | "end";
export type SwapPhase = "idle" | "resizing";

export const DEFAULT_SWAP_ANCHOR: SwapAnchor = "end";

/** 槽宽已贴目标则不必再插值。禁止第二套容差。 */
export const SWAP_WIDTH_EPS = 0.5;

export function resolveSwapAnchor(anchor?: SwapAnchor): SwapAnchor {
  return anchor ?? DEFAULT_SWAP_ANCHOR;
}

/** 锁了槽宽就是 resizing；未锁则 idle hug。 */
export function swapPhase(clipW: number | undefined): SwapPhase {
  return clipW === undefined ? "idle" : "resizing";
}

export interface SwapSkipInput {
  prevKey: string;
  skipMotion: boolean;
  attached: boolean;
  incomingText: string | null;
}

/** 首键、减动效、未入树、或无法解析文案：直切，不插宽。 */
export function shouldSkipSwap(input: SwapSkipInput): boolean {
  return !input.prevKey || input.skipMotion || !input.attached || input.incomingText === null;
}

/** 槽宽已贴目标。 */
export function swapWidthsSettled(fromW: number, toW: number): boolean {
  return Math.abs(toW - fromW) < SWAP_WIDTH_EPS;
}
