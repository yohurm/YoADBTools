/**
 * YoIndicator —— 轨上持续铬在项与项之间滑动（动画系统-v6.md 配方 indicator）。
 * 只给 Tabs 下划线与分段 thumb。列表 / 导航 / 树 / 下拉选项走配方 selected（项内弹出），禁止 fill 换行。
 * 必须作为 track 的子节点。轨自己声明 `yohu-indicator-host` 与 `data-indicator-variant`。
 * 实底测完后只把 `data-indicator-ready` 写在轨上，让选中片透明度继承到项。不改轨的 class。
 * 多选块（≥2）与「行级」虚拟列表过渡不要用。
 */
import { presenceAttr } from "../../../dom/flag";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";

import { motionDurationMs, motionSpecMs, type MotionDurationName } from "../../../tokens/motion";
import {
  EMPTY_INDICATOR,
  indicatorDurationName,
  indicatorReady,
  indicatorVariantIsFill,
  indicatorVariantIsUnderline,
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
  /** 在 track 内查找目标。默认公开标记 `[data-selected]`，不认交互态 class。 */
  selector?: string;
  /** 显式几何（虚拟列表 index×行高）。提供则不再测 DOM。 */
  anchor?: () => IndicatorBox | null;
}

const DEFAULT_SELECTOR = "[data-selected]";

function indicatorCssPx(value: number): string {
  return `${value}px`;
}

function indicatorObserve(target: Element, layout: () => void): ResizeObserver {
  const observer = new ResizeObserver(layout);
  observer.observe(target);
  return observer;
}

function indicatorCanObserve(): boolean {
  return typeof ResizeObserver !== "undefined";
}

function indicatorSelected(root: ParentNode | null | undefined, selector: string): HTMLElement | null {
  return root?.querySelector<HTMLElement>(selector) ?? null;
}

function indicatorClearMoving(setMoving: (moving: boolean) => void): void {
  setMoving(false);
}

function indicatorFollowMissing(follow: string | null | undefined): boolean {
  return follow == null;
}

function indicatorNextFrame(run: () => void): number {
  return requestAnimationFrame(run);
}

function indicatorRect(el: Element): DOMRect {
  return el.getBoundingClientRect();
}

function indicatorStyle(
  box: IndicatorBox,
  variant: IndicatorVariant,
  durationName: MotionDurationName | undefined,
): JSX.CSSProperties {
  const travel = durationName ? { "--yohu-indicator-dur": `var(--yohu-dur-${durationName})` } : {};
  if (indicatorVariantIsUnderline(variant)) {
    return {
      width: indicatorCssPx(box.width),
      transform: `translate3d(${indicatorCssPx(box.x)}, 0, 0)`,
      ...travel,
    };
  }
  return {
    width: indicatorCssPx(box.width),
    height: indicatorCssPx(box.height),
    top: indicatorCssPx(box.y),
    left: indicatorCssPx(box.x),
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
    indicatorClearMoving(setMoving);
  };

  const armMoving = (durationName: MotionDurationName): void => {
    const gen = ++moveGen;
    setMoving(true);
    const ms = Math.max(motionDurationMs(durationName), motionSpecMs("spatialLocal"));
    window.setTimeout(() => {
      if (gen === moveGen) {
        indicatorClearMoving(setMoving);
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
      indicatorNextFrame(() => setReady(true));
    }
  };

  const markReady = (track: HTMLElement | undefined): void => {
    if (!track || !indicatorVariantIsFill(variant())) return;
    if (ready()) {
      track.setAttribute("data-indicator-ready", "");
    } else {
      track.removeAttribute("data-indicator-ready");
    }
  };

  const layout = (): void => {
    const track = trackOf();
    if (!track || indicatorFollowMissing(props.follow)) {
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
    const item = indicatorSelected(track, selector());
    if (!item) {
      indicatorNextFrame(() => {
        if (indicatorFollowMissing(props.follow) || !trackOf()) {
          hide();
          return;
        }
        const again = indicatorSelected(trackOf(), selector());
        if (!again) {
          hide();
          return;
        }
        layout();
      });
      return;
    }
    commit(
      measureIndicator(indicatorRect(track), indicatorRect(item), {
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
    markReady(trackOf());
  });

  createEffect(() => {
    props.follow;
    selector();
    if (props.anchor) return;
    const track = trackOf();
    const item = indicatorSelected(track, selector());
    if (!indicatorCanObserve() || !item) return;
    const observer = indicatorObserve(item, layout);
    onCleanup(() => observer.disconnect());
  });

  onMount(() => {
    const track = trackOf();
    markReady(track);
    layout();
    if (!track) return;

    const listen = (type: string): (() => void) => {
      track.addEventListener(type, layout, true);
      return () => track.removeEventListener(type, layout, true);
    };
    const unbindScroll = bindScrollTree(track, layout);
    const stopTransitionRun = listen("transitionrun");
    const stopTransitionEnd = listen("transitionend");

    let trackRo: ResizeObserver | undefined;
    if (indicatorCanObserve()) {
      trackRo = indicatorObserve(track, layout);
    }

    onCleanup(() => {
      unbindScroll();
      stopTransitionRun();
      stopTransitionEnd();
      trackRo?.disconnect();
      stopMoving();
      track.removeAttribute("data-indicator-ready");
    });
  });

  return (
    <div
      ref={(el) => {
        thumb = el;
      }}
      class="yohu-recipe-indicator"
      classList={{ [`yohu-recipe-indicator--${variant()}`]: true }}
      data-ready={presenceAttr(ready())}
      data-moving={presenceAttr(moving())}
      style={indicatorStyle(box(), variant(), travel())}
      aria-hidden="true"
    />
  );
}
