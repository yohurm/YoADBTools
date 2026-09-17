/**
 * 滚轴 DOM 会话（L3 binder）。
 * 持有视口监听、滑块/轨道指针、Auto 隐藏与连翻定时器、ResizeObserver、相位 paint。
 * 几何走 scroller-model；attrs 仍由 L4 调 scroller-policy。
 * destroy 卸监听，幂等。不画铬。
 */

import { createSignal, type Accessor } from "solid-js";
import { shouldSkipMotion } from "../motion/reduced";
import {
  resolveScrollerClampedTop,
  resolveScrollerFlowChild,
  resolveScrollerFlowSize,
  resolveScrollerGutter,
  resolveScrollerOverflow,
  resolveScrollerPageTowardPointer,
  resolveScrollerPageTop,
  resolveScrollerPhase,
  resolveScrollerScrollEnd,
  resolveScrollerScrollTop,
  resolveScrollerThumb,
  resolveScrollerThumbCoversPointer,
  resolveScrollerThumbTop,
  resolveScrollerWheelDelta,
  SCROLLER_AUTO_HIDE_MS,
  SCROLLER_PAGE_REPEAT_MS,
  type ScrollerBarState,
  type ScrollerPhase,
  type ScrollerThumb,
} from "./scroller-model";
import { scrollerKeyAction, scrollerStealsKeys } from "./scroller-policy";

export interface ScrollerBinderHost {
  overflow: () => "auto" | "hidden";
  barState: () => ScrollerBarState;
  interactive: () => boolean;
  traveling: () => boolean;
}

export interface ScrollerBinder {
  phase: Accessor<ScrollerPhase>;
  thumb: Accessor<ScrollerThumb | undefined>;
  pressed: Accessor<boolean>;
  gutter: Accessor<boolean>;
  view: () => HTMLDivElement | undefined;
  attachView: (el: HTMLDivElement) => void;
  attachLane: (el: HTMLDivElement) => void;
  scrollTo: (top: number) => void;
  scrollBy: (delta: number) => void;
  scrollToStart: () => void;
  scrollToEnd: () => void;
  scrollPage: (next: boolean) => void;
  offset: () => number;
  valueNow: () => number;
  sync: () => void;
  onLanePointerDown: (event: PointerEvent) => void;
  onLanePointerMove: (event: PointerEvent) => void;
  onLanePointerUp: (event: PointerEvent) => void;
  onLaneEnter: () => void;
  onLaneLeave: () => void;
  onThumbTransitionEnd: (event: TransitionEvent) => void;
  destroy: () => void;
}

export function createScrollerBinder(host: ScrollerBinderHost): ScrollerBinder {
  const [phase, setPhase] = createSignal<ScrollerPhase>("none");
  const [thumb, setThumb] = createSignal<ScrollerThumb | undefined>();
  const [pressed, setPressed] = createSignal(false);
  const [gutter, setGutter] = createSignal(false);
  let view: HTMLDivElement | undefined;
  let lane: HTMLDivElement | undefined;
  let last: ScrollerPhase | undefined;
  let lastThumb: ScrollerThumb | undefined;
  let dragging = false;
  let paging = false;
  let grab = 0;
  let idle = false;
  let holding = false;
  let pageY = 0;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let pageTimer: ReturnType<typeof setInterval> | undefined;
  let ro: ResizeObserver | undefined;

  const measureFlow = (el: HTMLElement): number => {
    const boxes: { top: number; height: number }[] = [];
    for (let i = 0; i < el.children.length; i += 1) {
      const child = el.children[i];
      if (!(child instanceof HTMLElement)) continue;
      if (!resolveScrollerFlowChild(getComputedStyle(child).position)) continue;
      const top = child.offsetParent === el ? child.offsetTop : 0;
      boxes.push({ top, height: child.offsetHeight });
    }
    return resolveScrollerFlowSize(boxes);
  };

  const clearHide = (): void => {
    if (hideTimer === undefined) return;
    clearTimeout(hideTimer);
    hideTimer = undefined;
  };

  const stopPage = (): void => {
    paging = false;
    if (pageTimer === undefined) return;
    clearInterval(pageTimer);
    pageTimer = undefined;
  };

  const paint = (): void => {
    const el = view;
    if (!el || host.overflow() === "hidden") {
      last = undefined;
      lastThumb = undefined;
      idle = false;
      setPhase("none");
      setThumb(undefined);
      setGutter(false);
      return;
    }
    const all = measureFlow(el);
    const overflowing = resolveScrollerOverflow(el.clientHeight, all);
    setGutter(resolveScrollerGutter({ overflowing, barState: host.barState() }));
    const measured = overflowing
      ? resolveScrollerThumb({
          view: el.clientHeight,
          all,
          top: el.scrollTop,
        })
      : undefined;
    const next = resolveScrollerPhase({
      overflowing,
      traveling: host.traveling(),
      barState: host.barState(),
      idle,
      holding: holding || dragging || paging,
      prev: last,
    });
    if (shouldSkipMotion()) {
      const shown = next === "in" || next === "on";
      last = shown ? "on" : undefined;
      lastThumb = measured;
      setPhase(shown ? "on" : "none");
      setThumb(measured);
      return;
    }
    last = next === "none" ? undefined : next;
    if (next === "none") {
      lastThumb = undefined;
      setThumb(undefined);
    } else if (measured) {
      lastThumb = measured;
      setThumb(measured);
    } else {
      setThumb(lastThumb);
    }
    setPhase(next);
  };

  const scheduleHide = (): void => {
    clearHide();
    if (host.barState() !== "auto" || holding || dragging || paging) return;
    hideTimer = setTimeout(() => {
      idle = true;
      paint();
    }, SCROLLER_AUTO_HIDE_MS);
  };

  const bump = (): void => {
    idle = false;
    paint();
    scheduleHide();
  };

  const applyScrollTop = (top: number): void => {
    const el = view;
    if (!el) return;
    el.scrollTop = resolveScrollerClampedTop({
      top,
      view: el.clientHeight,
      all: measureFlow(el),
    });
    bump();
  };

  const scrollTo = (top: number): void => {
    applyScrollTop(top);
  };

  const scrollBy = (delta: number): void => {
    const el = view;
    if (!el) return;
    applyScrollTop(el.scrollTop + delta);
  };

  const scrollToStart = (): void => {
    applyScrollTop(0);
  };

  const scrollToEnd = (): void => {
    const el = view;
    if (!el) return;
    applyScrollTop(resolveScrollerScrollEnd(el.clientHeight, measureFlow(el)));
  };

  const scrollPage = (next: boolean): void => {
    const el = view;
    if (!el) return;
    applyScrollTop(
      resolveScrollerPageTop({
        view: el.clientHeight,
        all: measureFlow(el),
        top: el.scrollTop,
        next,
      }),
    );
  };

  const applyTop = (thumbTop: number): void => {
    const el = view;
    const current = thumb();
    if (!el || !current) return;
    applyScrollTop(
      resolveScrollerScrollTop({
        view: el.clientHeight,
        all: measureFlow(el),
        thumbHeight: current.height,
        thumbTop,
      }),
    );
  };

  const onWheel = (event: WheelEvent): void => {
    const el = view;
    if (!el || host.overflow() === "hidden" || !host.interactive()) return;
    const all = measureFlow(el);
    const end = resolveScrollerScrollEnd(el.clientHeight, all);
    if (!(end > 0)) return;
    const next = resolveScrollerClampedTop({
      top:
        el.scrollTop +
        resolveScrollerWheelDelta({
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          pageHeight: el.clientHeight,
        }),
      view: el.clientHeight,
      all,
    });
    if (next === el.scrollTop) return;
    event.preventDefault();
    applyScrollTop(next);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!host.interactive() || host.overflow() === "hidden" || scrollerStealsKeys(event.target)) return;
    const action = scrollerKeyAction(event.key);
    if (!action) return;
    event.preventDefault();
    if (action === "pageNext") {
      scrollPage(true);
      return;
    }
    if (action === "pagePrev") {
      scrollPage(false);
      return;
    }
    if (action === "start") {
      scrollToStart();
      return;
    }
    scrollToEnd();
  };

  const observe = (el: HTMLElement): void => {
    ro?.disconnect();
    if (typeof ResizeObserver === "undefined") return;
    ro = new ResizeObserver(() => {
      if (host.traveling()) return;
      paint();
      if (host.barState() === "auto" && resolveScrollerOverflow(el.clientHeight, measureFlow(el))) {
        scheduleHide();
      }
    });
    ro.observe(el);
    for (let i = 0; i < el.children.length; i += 1) {
      const child = el.children[i];
      if (child instanceof HTMLElement) ro.observe(child);
    }
  };

  const pageToward = (clientY: number): void => {
    const el = view;
    const track = lane;
    const current = thumb();
    if (!el || !track || !current) {
      stopPage();
      return;
    }
    const box = track.getBoundingClientRect();
    if (
      resolveScrollerThumbCoversPointer({
        pointerY: clientY,
        trackTop: box.top,
        thumbTop: current.top,
        thumbHeight: current.height,
      })
    ) {
      stopPage();
      setPressed(false);
      return;
    }
    const next = resolveScrollerPageTowardPointer({
      pointerY: clientY,
      trackTop: box.top,
      thumbTop: current.top,
      thumbHeight: current.height,
    });
    if (next === undefined) return;
    applyScrollTop(
      resolveScrollerPageTop({
        view: el.clientHeight,
        all: measureFlow(el),
        top: el.scrollTop,
        next,
      }),
    );
  };

  const onLanePointerDown = (event: PointerEvent): void => {
    const el = view;
    const track = lane;
    const current = thumb();
    if (!el || !track || !host.interactive() || phase() === "none" || phase() === "out" || !current) return;
    event.preventDefault();
    holding = true;
    setPressed(true);
    const box = track.getBoundingClientRect();
    const onThumb =
      event.target instanceof HTMLElement && event.target.classList.contains("yohu-scroller__thumb");
    if (onThumb) {
      grab = event.clientY - (box.top + current.top);
      applyTop(
        resolveScrollerThumbTop({
          pointerY: event.clientY,
          trackTop: box.top,
          grab,
          room: Math.max(0, el.clientHeight - current.height),
        }),
      );
      dragging = true;
    } else {
      pageY = event.clientY;
      paging = true;
      pageToward(event.clientY);
      if (pageTimer !== undefined) clearInterval(pageTimer);
      pageTimer = setInterval(() => pageToward(pageY), SCROLLER_PAGE_REPEAT_MS);
    }
    track.setPointerCapture(event.pointerId);
  };

  const onLanePointerMove = (event: PointerEvent): void => {
    const el = view;
    const track = lane;
    const current = thumb();
    if (!el || !track) return;
    pageY = event.clientY;
    if (dragging && current) {
      const box = track.getBoundingClientRect();
      applyTop(
        resolveScrollerThumbTop({
          pointerY: event.clientY,
          trackTop: box.top,
          grab,
          room: Math.max(0, el.clientHeight - current.height),
        }),
      );
    }
  };

  const onLanePointerUp = (event: PointerEvent): void => {
    dragging = false;
    stopPage();
    setPressed(false);
    if (lane?.hasPointerCapture(event.pointerId)) lane.releasePointerCapture(event.pointerId);
    holding = lane?.matches(":hover") === true;
    if (!holding) scheduleHide();
    paint();
  };

  const onLaneEnter = (): void => {
    if (!host.interactive() || phase() === "none") return;
    holding = true;
    idle = false;
    paint();
    clearHide();
  };

  const onLaneLeave = (): void => {
    if (dragging || paging) return;
    holding = false;
    scheduleHide();
    paint();
  };

  const onThumbTransitionEnd = (event: TransitionEvent): void => {
    if (event.target !== event.currentTarget) return;
    if (event.propertyName !== "opacity") return;
    if (phase() !== "out") return;
    last = undefined;
    lastThumb = undefined;
    setPhase("none");
    setThumb(undefined);
  };

  const detachView = (): void => {
    const el = view;
    if (!el) return;
    el.removeEventListener("scroll", bump);
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("keydown", onKeyDown);
  };

  const attachView = (el: HTMLDivElement): void => {
    detachView();
    view = el;
    el.addEventListener("scroll", bump, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("keydown", onKeyDown);
    observe(el);
    paint();
    if (host.barState() === "auto") scheduleHide();
  };

  const attachLane = (el: HTMLDivElement): void => {
    lane = el;
  };

  const sync = (): void => {
    if (view) observe(view);
    paint();
    if (host.barState() === "auto") scheduleHide();
  };

  const valueNow = (): number => {
    const el = view;
    if (!el) return 0;
    const range = measureFlow(el) - el.clientHeight;
    if (!(range > 0)) return 0;
    return Math.round((el.scrollTop / range) * 100);
  };

  const destroy = (): void => {
    detachView();
    ro?.disconnect();
    ro = undefined;
    clearHide();
    stopPage();
  };

  return {
    phase,
    thumb,
    pressed,
    gutter,
    view: () => view,
    attachView,
    attachLane,
    scrollTo,
    scrollBy,
    scrollToStart,
    scrollToEnd,
    scrollPage,
    offset: () => view?.scrollTop ?? 0,
    valueNow,
    sync,
    onLanePointerDown,
    onLanePointerMove,
    onLanePointerUp,
    onLaneEnter,
    onLaneLeave,
    onThumbTransitionEnd,
    destroy,
  };
}
