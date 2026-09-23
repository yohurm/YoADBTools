/**
 * YoIndicator —— 轨上持续铬在项与项之间滑动（动画系统-v6.md 配方 indicator）。
 * 只给 Tabs 下划线与分段 thumb。列表 / 导航 / 树 / 下拉选项走配方 selected（项内弹出），禁止 fill 换行。
 * 必须作为 track 的子节点。默认给 track 挂 `yohu-indicator-host`；
 * `decorate={false}` 时不挂（虚拟列表滚轴自己纵滚）。
 * 多选块（≥2）与「行级」虚拟列表过渡不要用。
 */
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";

import { motionDurationMs, motionSpecMs, type MotionDurationName } from "../../../tokens/motion";
import {
  EMPTY_INDICATOR,
  indicatorDurationName,
  indicatorReady,
  measureIndicator,
  type IndicatorBox,
  type IndicatorVariant,
} from "./indicator-layout";

export type { IndicatorVariant, IndicatorBox };

export interface YoIndicatorProps {
  /** 选中身份；变化时把滑块从旧盒过渡到新盒。null/undefined 隐藏。 */
  follow: string | null | undefined;
  /** fill=列表实底；underline=Tabs 底边；thumb=分段选择块。 */
  variant?: IndicatorVariant;
  /** 在 track 内查找目标。默认 `.yohu-interactive--selected`。 */
  selector?: string;
  /** 显式几何（虚拟列表 index×行高）。提供则不再测 DOM。 */
  anchor?: () => IndicatorBox | null;
  /**
   * 默认给父级挂 `yohu-indicator-host`（fill 会 overflow:hidden 裁切过冲）。
   * 虚拟列表滚轴自己纵滚，禁止把宿主 overflow 打在 scroller / 超高 inner 上。
   */
  decorate?: boolean;
}

const DEFAULT_SELECTOR = ".yohu-interactive--selected";

function indicatorStyle(
  box: IndicatorBox,
  variant: IndicatorVariant,
  durationName: MotionDurationName | undefined,
): JSX.CSSProperties {
  const travel = durationName ? { "--yohu-indicator-dur": `var(--yohu-dur-${durationName})` } : {};
  if (variant === "underline") {
    return {
      width: `${box.width}px`,
      transform: `translate3d(${box.x}px, 0, 0)`,
      ...travel,
    };
  }
  return {
    width: `${box.width}px`,
    height: `${box.height}px`,
    top: `${box.y}px`,
    left: `${box.x}px`,
    ...travel,
  };
}

function bindScrollTree(root: HTMLElement, onScroll: () => void): () => void {
  root.addEventListener("scroll", onScroll, { passive: true });
  const nested: Array<() => void> = [];
  for (const child of root.children) {
    if (child instanceof HTMLElement) {
      nested.push(bindScrollTree(child, onScroll));
    }
  }
  return () => {
    root.removeEventListener("scroll", onScroll);
    for (const unbind of nested) unbind();
  };
}

/**
 * 渲染一块跟随选中项的滑块。几何由实测盒或 anchor 决定。
 */
export function YoIndicator(props: YoIndicatorProps): JSX.Element {
  let thumb: HTMLDivElement | undefined;
  const [box, setBox] = createSignal<IndicatorBox>(EMPTY_INDICATOR);
  const [ready, setReady] = createSignal(false);
  const [travel, setTravel] = createSignal<MotionDurationName | undefined>(undefined);
  const [moving, setMoving] = createSignal(false);
  let lastFollow: string | null | undefined;
  let moveGen = 0;

  const stopMoving = (): void => {
    moveGen += 1;
    setMoving(false);
  };

  const armMoving = (durationName: MotionDurationName): void => {
    const gen = ++moveGen;
    setMoving(true);
    const ms = Math.max(motionDurationMs(durationName), motionSpecMs("spatialLocal"));
    window.setTimeout(() => {
      if (gen === moveGen) {
        setMoving(false);
      }
    }, ms);
  };

  const variant = (): IndicatorVariant => props.variant ?? "fill";
  const selector = (): string => props.selector ?? DEFAULT_SELECTOR;
  const trackOf = (): HTMLElement | undefined => thumb?.parentElement ?? undefined;

  const hide = (): void => {
    setBox(EMPTY_INDICATOR);
    setReady(false);
    setTravel(undefined);
    stopMoving();
    lastFollow = undefined;
  };

  const commit = (next: IndicatorBox): void => {
    if (!indicatorReady(next)) {
      return;
    }
    const prev = box();
    const followNow = props.follow;
    const followChanged = followNow !== lastFollow;
    lastFollow = followNow;
    if (ready() && indicatorReady(prev) && followChanged) {
      const durationName = indicatorDurationName(prev, next);
      setTravel(durationName);
      armMoving(durationName);
    } else if (followChanged) {
      setTravel(undefined);
      stopMoving();
    }
    setBox(next);
    if (!ready()) {
      requestAnimationFrame(() => setReady(true));
    }
  };

  const shouldDecorate = (): boolean => props.decorate !== false;

  const decorate = (track: HTMLElement | undefined): void => {
    if (!track || !shouldDecorate()) return;
    track.classList.add("yohu-indicator-host");
    track.setAttribute("data-indicator-variant", variant());
    if (ready()) {
      track.setAttribute("data-indicator-ready", "");
    } else {
      track.removeAttribute("data-indicator-ready");
    }
  };

  const layout = (): void => {
    const track = trackOf();
    if (!track || props.follow == null) {
      hide();
      return;
    }
    if (props.anchor) {
      const next = props.anchor();
      if (!next) {
        hide();
        return;
      }
      commit(next);
      return;
    }
    const item = track.querySelector<HTMLElement>(selector());
    if (!item) {
      requestAnimationFrame(() => {
        if (props.follow == null || !trackOf()) {
          hide();
          return;
        }
        const again = trackOf()?.querySelector<HTMLElement>(selector());
        if (!again) {
          hide();
          return;
        }
        layout();
      });
      return;
    }
    commit(
      measureIndicator(track.getBoundingClientRect(), item.getBoundingClientRect(), {
        left: track.scrollLeft,
        top: track.scrollTop,
      }),
    );
  };

  createEffect(() => {
    props.follow;
    variant();
    selector();
    props.anchor?.();
    queueMicrotask(layout);
  });

  createEffect(() => {
    ready();
    variant();
    decorate(trackOf());
  });

  createEffect(() => {
    props.follow;
    selector();
    if (props.anchor) return;
    const track = trackOf();
    const item = track?.querySelector<HTMLElement>(selector());
    if (typeof ResizeObserver === "undefined" || !item) return;
    const observer = new ResizeObserver(() => layout());
    observer.observe(item);
    onCleanup(() => observer.disconnect());
  });

  onMount(() => {
    const track = trackOf();
    decorate(track);
    layout();
    if (!track) return;

    const onTransition = (): void => layout();
    const unbindScroll = bindScrollTree(track, layout);
    track.addEventListener("transitionrun", onTransition, true);
    track.addEventListener("transitionend", onTransition, true);

    let trackRo: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      trackRo = new ResizeObserver(() => layout());
      trackRo.observe(track);
    }

    onCleanup(() => {
      unbindScroll();
      track.removeEventListener("transitionrun", onTransition, true);
      track.removeEventListener("transitionend", onTransition, true);
      trackRo?.disconnect();
      stopMoving();
      if (shouldDecorate()) {
        track.classList.remove("yohu-indicator-host");
        track.removeAttribute("data-indicator-variant");
        track.removeAttribute("data-indicator-ready");
      }
    });
  });

  return (
    <div
      ref={(el) => {
        thumb = el;
      }}
      class="yohu-recipe-indicator"
      classList={{ [`yohu-recipe-indicator--${variant()}`]: true }}
      data-ready={ready() ? "" : undefined}
      data-moving={moving() ? "" : undefined}
      style={indicatorStyle(box(), variant(), travel())}
      aria-hidden="true"
    />
  );
}
