/**
 * YoSwap —— 沿轴展开/收缩（动画系统-v6.md 配方 swap，与侧栏/预览栏同一套）。
 * 一律先换目标文案，再把槽宽从旧固有宽插到新固有宽；overflow 裁切。
 * 目标宽只认 `__inner` 实盒，禁止探针另测一套。默认贴 inline-end（往左收）。
 * 禁止收到尽头再换字（最后一帧残字闪成新文案）。
 */
import { children, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { resolveText } from "../dom/text";
import { motionDurationMs } from "../tokens/motion";
import { shouldSkipMotion } from "./reduced";
import { PRESENCE_EXIT_SAFETY_MS, SWAP_DURATION } from "./recipes";

export interface YoSwapProps {
  /** 身份；变化时按方向展开或收缩 */
  keys: string;
  children: JSX.Element;
  /** 裁切锚点。end = 贴右往左收（预览栏/窗口右缘）。默认 end。 */
  anchor?: "start" | "end";
}

/** 槽宽已贴目标则不必再插值。禁止第二套容差。 */
export const SWAP_WIDTH_EPS = 0.5;

/**
 * 按 keys 把槽宽从旧文案插到新文案：先换字，变长露出、变短收掉空白。
 */
export function YoSwap(props: YoSwapProps): JSX.Element {
  const resolved = children(() => props.children);
  const [view, setView] = createSignal<JSX.Element | null>(null);
  const [clipW, setClipW] = createSignal<number | undefined>(undefined);
  const [resizing, setResizing] = createSignal(false);
  const visible = createMemo(() => view() ?? resolved());

  let host: HTMLSpanElement | undefined;
  let clip: HTMLSpanElement | undefined;
  let inner: HTMLSpanElement | undefined;
  let currentKey = "";
  let gen = 0;

  createEffect(() => {
    const nextKey = props.keys;
    const incoming = resolved();
    if (nextKey === currentKey) {
      return;
    }
    const prevKey = currentKey;
    currentKey = nextKey;

    const incomingText = resolveText(incoming);
    const clipEl = clip;
    const skip = !prevKey || shouldSkipMotion() || !host || !clipEl || incomingText === null;
    if (skip) {
      setView(() => incoming);
      setClipW(undefined);
      setResizing(false);
      return;
    }

    const fromW = clipEl.getBoundingClientRect().width;
    setView(() => incoming);
    setResizing(false);
    setClipW(fromW);

    const thisGen = ++gen;
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (thisGen !== gen) {
          return;
        }
        const toW = inner?.getBoundingClientRect().width ?? fromW;
        if (Math.abs(toW - fromW) < SWAP_WIDTH_EPS) {
          setClipW(undefined);
          setResizing(false);
          return;
        }
        setResizing(true);
        setClipW(toW);
      });
    });

    const finish = (): void => {
      if (thisGen !== gen) {
        return;
      }
      setResizing(false);
    };

    const timer = window.setTimeout(finish, motionDurationMs(SWAP_DURATION) + PRESENCE_EXIT_SAFETY_MS);
    const onEnd = (event: TransitionEvent): void => {
      if (event.propertyName !== "width" || event.target !== clipEl) {
        return;
      }
      window.clearTimeout(timer);
      finish();
    };
    clipEl.addEventListener("transitionend", onEnd);
    onCleanup(() => {
      gen += 1;
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(timer);
      clipEl.removeEventListener("transitionend", onEnd);
    });
  });

  return (
    <span
      ref={(el) => (host = el)}
      class="yohu-swap"
      data-anchor={props.anchor ?? "end"}
      data-resizing={resizing() ? "true" : undefined}
    >
      <span
        ref={(el) => (clip = el)}
        class="yohu-swap__clip"
        style={{ width: clipW() === undefined ? undefined : `${clipW()}px` }}
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
