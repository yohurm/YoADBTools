/**
 * 换牌会话策略（L3）。
 * finish / cleanup / 同 key 早退必须归还 clipW；只装配宿主契约。
 * 不测盒、不绑事件。
 */

import {
  resolveSwapAnchor,
  swapPhase,
  swapWidthsSettled,
  type SwapAnchor,
  type SwapPhase,
} from "./swap-model";

export interface SwapSessionPaint {
  clipW: number | undefined;
  resizing: boolean;
}

export type SwapKeyAdvance =
  | { kind: "same"; key: string }
  | { kind: "change"; prevKey: string; nextKey: string };

/** 该代结束：idle hug，归还 clipW。finish / skip / 同 key 同一出口。 */
export function releaseSwapSession(): SwapSessionPaint {
  return { clipW: undefined, resizing: false };
}

/** 先换字后的固帧：锁旧宽，尚未插值。 */
export function holdSwapSession(fromW: number): SwapSessionPaint {
  return { clipW: fromW, resizing: false };
}

/** 测到目标宽：贴则归还；否则 resizing 插到 toW。 */
export function resolveSwapToWidth(fromW: number, toW: number): SwapSessionPaint {
  if (swapWidthsSettled(fromW, toW)) {
    return releaseSwapSession();
  }
  return { clipW: toW, resizing: true };
}

export function resolveSwapKeyAdvance(currentKey: string, nextKey: string): SwapKeyAdvance {
  if (nextKey === currentKey) {
    return { kind: "same", key: nextKey };
  }
  return { kind: "change", prevKey: currentKey, nextKey };
}

/** cleanup 升代：丢弃晚到回调，并归还 clipW。 */
export function cleanupSwapGeneration(gen: number): { gen: number } & SwapSessionPaint {
  return { gen: gen + 1, ...releaseSwapSession() };
}

export function isSwapWidthTransitionEnd(
  propertyName: string,
  eventTarget: EventTarget | null,
  clip: EventTarget | null,
): boolean {
  return propertyName === "width" && eventTarget === clip;
}

export interface SwapHostAttrs {
  "data-anchor": SwapAnchor;
  "data-phase": SwapPhase;
  "data-resizing": "true" | undefined;
}

export function swapHostAttrs(
  anchor: SwapAnchor | undefined,
  paint: SwapSessionPaint,
): SwapHostAttrs {
  return {
    "data-anchor": resolveSwapAnchor(anchor),
    "data-phase": swapPhase(paint.clipW),
    "data-resizing": paint.resizing ? "true" : undefined,
  };
}

export function swapClipWidth(clipW: number | undefined): string | undefined {
  return clipW === undefined ? undefined : `${clipW}px`;
}
