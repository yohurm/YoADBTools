/**
 * YoSwap —— 沿轴展开/收缩（动画系统-v6.md 配方 swap，L4 绑 DOM / L5 薄门面）。
 * 一律先换目标文案，再把槽宽从旧固有宽插到新固有宽。
 * 目标宽只认 `__inner` 的 offsetWidth，上屏前写入。默认贴 inline-end（往左收）。
 * 禁止双 rAF、禁止量可视盒、禁止收到尽头再换字。
 */
import { children, createMemo, createRenderEffect, createSignal, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { resolveText } from "../../../dom/text";
import { motionDurationMs } from "../../../tokens/motion";
import { shouldSkipMotion } from "../../reduced";
import { PRESENCE_EXIT_SAFETY_MS, SWAP_DURATION } from "../../spec/recipes";
import { shouldSkipSwap, type SwapAnchor } from "./swap-model";
import {
  holdSwapSession,
  isSwapWidthTransitionEnd,
  releaseSwapSession,
  resolveSwapKeyAdvance,
  resolveSwapToWidth,
  swapAdvanceIsSame,
  swapClipWidth,
  swapHostAttrs,
  type SwapSessionPaint,
} from "./swap-policy";

export type { SwapAnchor };

export interface YoSwapProps {
  /** 身份；变化时按方向展开或收缩 */
  keys: string;
  children: JSX.Element;
  /**
   * 裁切锚点。
   * end = 贴右往左收（预览栏/窗口右缘）。
   * center = 居中（按钮文案；槽解锁后固有宽 = 字宽）。
   * 默认 end。
   */
  anchor?: SwapAnchor;
}

function swapApplyPaint(
  setResizing: (value: boolean) => void,
  setClipW: (value: number | undefined) => void,
  paint: SwapSessionPaint,
): void {
  setResizing(paint.resizing);
  setClipW(paint.clipW);
}

function swapWidth(el: HTMLElement): number {
  return el.offsetWidth;
}

function swapShowIncoming(setView: (next: () => JSX.Element) => void, incoming: JSX.Element): void {
  setView(() => incoming);
}

function swapClearTimer(timer: number): void {
  window.clearTimeout(timer);
}

/**
 * 按 keys 把槽宽从旧文案插到新文案：先换字，变长露出、变短收掉空白。
 */
export function YoSwap(props: YoSwapProps): JSX.Element {
  const resolved = children(() => props.children);
  const [view, setView] = createSignal<JSX.Element | null>(null);
  const [clipW, setClipW] = createSignal<number | undefined>(undefined);
  const [resizing, setResizing] = createSignal(false);
  const visible = createMemo(() => view() ?? resolved());
  const hostAttrs = createMemo(() => swapHostAttrs(props.anchor, { clipW: clipW(), resizing: resizing() }));

  let host: HTMLSpanElement | undefined;
  let clip: HTMLSpanElement | undefined;
  let inner: HTMLSpanElement | undefined;
  let currentKey = "";
  let gen = 0;
  let measureAfterSwap = false;

  function swapStopMeasure(): void {
    measureAfterSwap = false;
  }

  const idle = (): void => {
    const paint = releaseSwapSession();
    setResizing(paint.resizing);
    setClipW(undefined);
    swapStopMeasure();
  };

  createRenderEffect(() => {
    const nextKey = props.keys;
    const incoming = resolved();
    const advance = resolveSwapKeyAdvance(currentKey, nextKey);
    if (swapAdvanceIsSame(advance)) {
      idle();
      return;
    }
    currentKey = advance.nextKey;

    const incomingText = resolveText(incoming);
    const clipEl = clip;
    if (
      !clipEl ||
      shouldSkipSwap({
        prevKey: advance.prevKey,
        skipMotion: shouldSkipMotion(),
        attached: Boolean(host && clipEl),
        incomingText,
      })
    ) {
      swapShowIncoming(setView, incoming);
      idle();
      return;
    }

    const fromW = swapWidth(clipEl);
    swapShowIncoming(setView, incoming);
    const hold = holdSwapSession(fromW);
    swapApplyPaint(setResizing, setClipW, hold);
    measureAfterSwap = true;
  });

  createRenderEffect(() => {
    view();
    if (!measureAfterSwap || !inner || !clip) return;
    swapStopMeasure();
    const thisGen = ++gen;
    const fromW = swapWidth(clip);
    const toW = swapWidth(inner);
    const next = resolveSwapToWidth(fromW, toW);
    swapApplyPaint(setResizing, setClipW, next);
    if (next.clipW === undefined) return;

    const clipEl = clip;
    const finish = (): void => {
      if (thisGen !== gen) return;
      idle();
    };
    const timer = window.setTimeout(finish, motionDurationMs(SWAP_DURATION) + PRESENCE_EXIT_SAFETY_MS);
    const onEnd = (event: TransitionEvent): void => {
      if (!isSwapWidthTransitionEnd(event.propertyName, event.target, clipEl)) return;
      swapClearTimer(timer);
      finish();
    };
    clipEl.addEventListener("transitionend", onEnd);
    onCleanup(() => {
      swapClearTimer(timer);
      clipEl.removeEventListener("transitionend", onEnd);
    });
  });

  return (
    <span
      ref={(el) => (host = el)}
      class="yohu-swap"
      data-anchor={hostAttrs()["data-anchor"]}
      data-phase={hostAttrs()["data-phase"]}
      data-resizing={hostAttrs()["data-resizing"]}
    >
      <span
        ref={(el) => (clip = el)}
        class="yohu-swap__clip"
        style={{ width: swapClipWidth(clipW()) }}
      >
        <span
          ref={(el) => (inner = el)}
          class="yohu-swap__inner"
        >
          {visible()}
        </span>
      </span>
    </span>
  );
}
