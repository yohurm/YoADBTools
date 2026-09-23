/**
 * 滚轴 DOM 会话（L3 binder）。
 * 持有视口监听、滑块/轨道指针、Auto 隐藏与连翻定时器、ResizeObserver、相位 paint。
 * 偏移数字在 scroller-session；本文件只把数字落到 DOM（flow 写 scrollTop，offset 不写）。
 * 几何走 scroller-model；attrs 仍由 L4 调 scroller-policy。
 * 热路径用缓存尺 + rAF 画条。声明 extent 时不量 in-flow 子盒、不 getComputedStyle。
 * destroy 卸监听，幂等。不画铬。
 */

import { createSignal, type Accessor } from "solid-js";
import { shouldSkipMotion } from "../motion/reduced";
import {
  resolveScrollerClampedTop,
  resolveScrollerContentBox,
  resolveScrollerDrive,
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
  resolveScrollerViewFromGutter,
  type ScrollerAxis,
  type ScrollerBarState,
  type ScrollerDrive,
  type ScrollerExtent,
  type ScrollerMetrics,
  type ScrollerPhase,
  type ScrollerThumb,
  SCROLLER_AUTO_HIDE_MS,
  SCROLLER_PAGE_HOLD_MS,
  SCROLLER_PAGE_REPEAT_MS,
} from "./scroller-model";
import { scrollerKeyAction, scrollerStealsKeys } from "./scroller-policy";
import { createScrollerSession } from "./scroller-session";

export interface ScrollerBinderHost {
  overflow: () => "auto" | "hidden";
  barState: () => ScrollerBarState;
  interactive: () => boolean;
  traveling: () => boolean;
  axis: () => ScrollerAxis;
  /** 声明内容尺。有则 paint / 夹 top 不再量 in-flow 子盒。 */
  extent?: () => ScrollerExtent | undefined;
  /** 会话偏移变化。offset 驱动由调用方写平面 transform。 */
  onOffset?: (block: number, inline: number) => void;
}

export interface ScrollerBinder {
  phase: Accessor<ScrollerPhase>;
  phaseInline: Accessor<ScrollerPhase>;
  thumb: Accessor<ScrollerThumb | undefined>;
  thumbInline: Accessor<ScrollerThumb | undefined>;
  pressed: Accessor<boolean>;
  pressedInline: Accessor<boolean>;
  gutter: Accessor<boolean>;
  gutterInline: Accessor<boolean>;
  view: () => HTMLDivElement | undefined;
  attachView: (el: HTMLDivElement) => void;
  attachLane: (el: HTMLDivElement) => void;
  attachLaneInline: (el: HTMLDivElement) => void;
  scrollTo: (top: number) => void;
  scrollBy: (delta: number) => void;
  scrollToStart: () => void;
  scrollToEnd: () => void;
  scrollPage: (next: boolean) => void;
  scrollToInline: (left: number) => void;
  offset: () => number;
  offsetInline: () => number;
  valueNow: () => number;
  valueNowInline: () => number;
  sync: () => void;
  onLanePointerDown: (event: PointerEvent) => void;
  onLanePointerMove: (event: PointerEvent) => void;
  onLanePointerUp: (event: PointerEvent) => void;
  onLaneEnter: () => void;
  onLaneLeave: () => void;
  onInlineLanePointerDown: (event: PointerEvent) => void;
  onInlineLanePointerMove: (event: PointerEvent) => void;
  onInlineLanePointerUp: (event: PointerEvent) => void;
  onInlineLaneEnter: () => void;
  onInlineLaneLeave: () => void;
  onThumbTransitionEnd: (event: TransitionEvent) => void;
  destroy: () => void;
}

export function createScrollerBinder(host: ScrollerBinderHost): ScrollerBinder {
  const [phase, setPhase] = createSignal<ScrollerPhase>("none");
  const [phaseInline, setPhaseInline] = createSignal<ScrollerPhase>("none");
  const [thumb, setThumb] = createSignal<ScrollerThumb | undefined>();
  const [thumbInline, setThumbInline] = createSignal<ScrollerThumb | undefined>();
  const [pressed, setPressed] = createSignal(false);
  const [pressedInline, setPressedInline] = createSignal(false);
  const [gutter, setGutter] = createSignal(false);
  const [gutterInline, setGutterInline] = createSignal(false);
  let view: HTMLDivElement | undefined;
  let lane: HTMLDivElement | undefined;
  let laneInline: HTMLDivElement | undefined;
  let last: ScrollerPhase | undefined;
  let lastInline: ScrollerPhase | undefined;
  let lastThumb: ScrollerThumb | undefined;
  let lastThumbInline: ScrollerThumb | undefined;
  let dragging = false;
  let draggingInline = false;
  let paging = false;
  let pagingInline = false;
  let grab = 0;
  let grabInline = 0;
  let idle = false;
  let holding = false;
  let holdingInline = false;
  let pageY = 0;
  let pageX = 0;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let pageHold: ReturnType<typeof setTimeout> | undefined;
  let pageTimer: ReturnType<typeof setInterval> | undefined;
  let ro: ResizeObserver | undefined;
  let paintFrame = 0;
  const session = createScrollerSession();
  const metrics: ScrollerMetrics = {
    viewBlock: 0,
    contentBlock: 0,
    viewInline: 0,
    contentInline: 0,
  };

  const drive = (): ScrollerDrive => resolveScrollerDrive(host.extent?.());

  const writeFlowDom = (): void => {
    const el = view;
    if (!el || drive() !== "flow") return;
    const off = session.offset();
    el.scrollTop = off.block;
    if (host.axis() === "both") el.scrollLeft = off.inline;
    else el.scrollLeft = 0;
  };

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

  const measureFlowInline = (el: HTMLElement): number => {
    const boxes: { top: number; height: number }[] = [];
    for (let i = 0; i < el.children.length; i += 1) {
      const child = el.children[i];
      if (!(child instanceof HTMLElement)) continue;
      if (!resolveScrollerFlowChild(getComputedStyle(child).position)) continue;
      const left = child.offsetParent === el ? child.offsetLeft : 0;
      boxes.push({ top: left, height: child.offsetWidth });
    }
    return resolveScrollerFlowSize(boxes);
  };

  const refreshMetrics = (el: HTMLElement): ScrollerMetrics => {
    metrics.viewBlock = resolveScrollerViewFromGutter(el.clientHeight, gutterInline());
    metrics.viewInline = resolveScrollerViewFromGutter(el.clientWidth, gutter());
    const declared = host.extent?.();
    const measuredBlock = declared ? 0 : measureFlow(el);
    const measuredInline = declared || host.axis() !== "both" ? metrics.viewInline : measureFlowInline(el);
    const content = resolveScrollerContentBox(declared, measuredBlock, measuredInline, metrics.viewInline);
    metrics.contentBlock = content.block;
    metrics.contentInline = content.inline;
    session.setMetrics(metrics);
    return metrics;
  };

  const commitPhase = (
    next: ScrollerPhase,
    measured: ScrollerThumb | undefined,
    which: "block" | "inline",
  ): void => {
    if (which === "block") {
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
      return;
    }
    if (shouldSkipMotion()) {
      const shown = next === "in" || next === "on";
      lastInline = shown ? "on" : undefined;
      lastThumbInline = measured;
      setPhaseInline(shown ? "on" : "none");
      setThumbInline(measured);
      return;
    }
    lastInline = next === "none" ? undefined : next;
    if (next === "none") {
      lastThumbInline = undefined;
      setThumbInline(undefined);
    } else if (measured) {
      lastThumbInline = measured;
      setThumbInline(measured);
    } else {
      setThumbInline(lastThumbInline);
    }
    setPhaseInline(next);
  };

  const clearHide = (): void => {
    if (hideTimer === undefined) return;
    clearTimeout(hideTimer);
    hideTimer = undefined;
  };

  const stopPage = (): void => {
    paging = false;
    pagingInline = false;
    if (pageHold !== undefined) {
      clearTimeout(pageHold);
      pageHold = undefined;
    }
    if (pageTimer === undefined) return;
    clearInterval(pageTimer);
    pageTimer = undefined;
  };

  const resetInline = (): void => {
    lastInline = undefined;
    lastThumbInline = undefined;
    setPhaseInline("none");
    setThumbInline(undefined);
    setGutterInline(false);
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
      resetInline();
      return;
    }
    const box = refreshMetrics(el);
    const prev = session.offset();
    const next = session.reclamp();
    if (next.block !== prev.block || next.inline !== prev.inline) {
      writeFlowDom();
      host.onOffset?.(next.block, next.inline);
    } else if (drive() === "flow" && host.axis() === "block") {
      el.scrollLeft = 0;
    }
    const overflowing = resolveScrollerOverflow(box.viewBlock, box.contentBlock);
    setGutter(resolveScrollerGutter({ overflowing, barState: host.barState() }));
    const measured = overflowing
      ? resolveScrollerThumb({
          view: box.viewBlock,
          all: box.contentBlock,
          top: next.block,
        })
      : undefined;
    commitPhase(
      resolveScrollerPhase({
        overflowing,
        traveling: host.traveling(),
        barState: host.barState(),
        idle,
        holding: holding || dragging || paging,
        prev: last,
      }),
      measured,
      "block",
    );
    if (host.axis() !== "both") {
      resetInline();
      return;
    }
    const overflowingInline = resolveScrollerOverflow(box.viewInline, box.contentInline);
    setGutterInline(resolveScrollerGutter({ overflowing: overflowingInline, barState: host.barState() }));
    const measuredInline = overflowingInline
      ? resolveScrollerThumb({
          view: box.viewInline,
          all: box.contentInline,
          top: next.inline,
        })
      : undefined;
    commitPhase(
      resolveScrollerPhase({
        overflowing: overflowingInline,
        traveling: host.traveling(),
        barState: host.barState(),
        idle,
        holding: holdingInline || draggingInline || pagingInline,
        prev: lastInline,
      }),
      measuredInline,
      "inline",
    );
  };

  const schedulePaint = (): void => {
    if (typeof requestAnimationFrame !== "function") {
      paint();
      return;
    }
    if (paintFrame !== 0) return;
    paintFrame = requestAnimationFrame(() => {
      paintFrame = 0;
      paint();
    });
  };

  const scheduleHide = (): void => {
    clearHide();
    if (host.barState() !== "auto" || holding || holdingInline || dragging || draggingInline || paging || pagingInline) {
      return;
    }
    hideTimer = setTimeout(() => {
      idle = true;
      schedulePaint();
    }, SCROLLER_AUTO_HIDE_MS);
  };

  const bump = (): void => {
    idle = false;
    schedulePaint();
    scheduleHide();
  };

  const applyScrollTop = (top: number, refresh = false): void => {
    const el = view;
    if (!el) return;
    if (refresh || !(metrics.contentBlock > 0 || metrics.viewBlock > 0)) refreshMetrics(el);
    const prev = session.offset();
    const next = session.moveTo(top, prev.inline);
    const changed = next.block !== prev.block || next.inline !== prev.inline;
    if (changed) writeFlowDom();
    if (changed || refresh) host.onOffset?.(next.block, next.inline);
    bump();
  };

  const applyScrollLeft = (left: number, refresh = false): void => {
    const el = view;
    if (!el || host.axis() !== "both") return;
    if (refresh || !(metrics.contentInline > 0 || metrics.viewInline > 0)) refreshMetrics(el);
    const prev = session.offset();
    const next = session.moveTo(prev.block, left);
    const changed = next.block !== prev.block || next.inline !== prev.inline;
    if (changed) writeFlowDom();
    if (changed || refresh) host.onOffset?.(next.block, next.inline);
    bump();
  };

  const scrollTo = (top: number): void => {
    applyScrollTop(top, true);
  };

  const scrollBy = (delta: number): void => {
    if (!view) return;
    applyScrollTop(session.offset().block + delta);
  };

  const scrollToStart = (): void => {
    applyScrollTop(0);
  };

  const scrollToEnd = (): void => {
    if (view) refreshMetrics(view);
    applyScrollTop(resolveScrollerScrollEnd(metrics.viewBlock, metrics.contentBlock));
  };

  const scrollPage = (next: boolean): void => {
    if (!view) return;
    applyScrollTop(
      resolveScrollerPageTop({
        view: metrics.viewBlock,
        all: metrics.contentBlock,
        top: session.offset().block,
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
        view: metrics.viewBlock,
        all: metrics.contentBlock,
        thumbHeight: current.height,
        thumbTop,
      }),
    );
  };

  const applyLeft = (thumbLeft: number): void => {
    const el = view;
    const current = thumbInline();
    if (!el || !current) return;
    applyScrollLeft(
      resolveScrollerScrollTop({
        view: metrics.viewInline,
        all: metrics.contentInline,
        thumbHeight: current.height,
        thumbTop: thumbLeft,
      }),
    );
  };

  const onWheel = (event: WheelEvent): void => {
    const el = view;
    if (!el || host.overflow() === "hidden" || !host.interactive()) return;
    const off = session.offset();
    const inline =
      host.axis() === "both" && (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY));
    if (inline) {
      const end = resolveScrollerScrollEnd(metrics.viewInline, metrics.contentInline);
      if (!(end > 0)) return;
      const delta = resolveScrollerWheelDelta({
        deltaY: event.shiftKey ? event.deltaY : event.deltaX,
        deltaMode: event.deltaMode,
        pageHeight: metrics.viewInline,
      });
      const next = resolveScrollerClampedTop({
        top: off.inline + delta,
        view: metrics.viewInline,
        all: metrics.contentInline,
      });
      if (next === off.inline) return;
      event.preventDefault();
      applyScrollLeft(next);
      return;
    }
    const end = resolveScrollerScrollEnd(metrics.viewBlock, metrics.contentBlock);
    if (!(end > 0)) return;
    const next = resolveScrollerClampedTop({
      top:
        off.block +
        resolveScrollerWheelDelta({
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          pageHeight: metrics.viewBlock,
        }),
      view: metrics.viewBlock,
      all: metrics.contentBlock,
    });
    if (next === off.block) return;
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
      const box = metrics;
      const block = resolveScrollerOverflow(box.viewBlock, box.contentBlock);
      const inline = host.axis() === "both" && resolveScrollerOverflow(box.viewInline, box.contentInline);
      if (host.barState() === "auto" && (block || inline)) {
        scheduleHide();
      }
    });
    ro.observe(el);
    if (host.extent?.() != null) return;
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
        view: metrics.viewBlock,
        all: metrics.contentBlock,
        top: session.offset().block,
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
          room: Math.max(0, metrics.viewBlock - current.height),
        }),
      );
      dragging = true;
    } else {
      pageY = event.clientY;
      paging = true;
      pageToward(event.clientY);
      if (paging) {
        pageHold = setTimeout(() => {
          pageHold = undefined;
          pageTimer = setInterval(() => pageToward(pageY), SCROLLER_PAGE_REPEAT_MS);
        }, SCROLLER_PAGE_HOLD_MS);
      }
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
          room: Math.max(0, metrics.viewBlock - current.height),
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
    if (!holding && !holdingInline) scheduleHide();
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

  const pageTowardInline = (clientX: number): void => {
    const el = view;
    const track = laneInline;
    const current = thumbInline();
    if (!el || !track || !current) {
      pagingInline = false;
      return;
    }
    const box = track.getBoundingClientRect();
    if (
      resolveScrollerThumbCoversPointer({
        pointerY: clientX,
        trackTop: box.left,
        thumbTop: current.top,
        thumbHeight: current.height,
      })
    ) {
      pagingInline = false;
      setPressedInline(false);
      return;
    }
    const next = resolveScrollerPageTowardPointer({
      pointerY: clientX,
      trackTop: box.left,
      thumbTop: current.top,
      thumbHeight: current.height,
    });
    if (next === undefined) return;
    applyScrollLeft(
      resolveScrollerPageTop({
        view: metrics.viewInline,
        all: metrics.contentInline,
        top: session.offset().inline,
        next,
      }),
    );
  };

  const onInlineLanePointerDown = (event: PointerEvent): void => {
    const el = view;
    const track = laneInline;
    const current = thumbInline();
    if (!el || !track || !host.interactive() || phaseInline() === "none" || phaseInline() === "out" || !current) {
      return;
    }
    event.preventDefault();
    holdingInline = true;
    setPressedInline(true);
    const box = track.getBoundingClientRect();
    const onThumb =
      event.target instanceof HTMLElement && event.target.classList.contains("yohu-scroller__thumb");
    if (onThumb) {
      grabInline = event.clientX - (box.left + current.top);
      applyLeft(
        resolveScrollerThumbTop({
          pointerY: event.clientX,
          trackTop: box.left,
          grab: grabInline,
          room: Math.max(0, metrics.viewInline - current.height),
        }),
      );
      draggingInline = true;
    } else {
      pageX = event.clientX;
      pagingInline = true;
      pageTowardInline(event.clientX);
      if (pagingInline) {
        pageHold = setTimeout(() => {
          pageHold = undefined;
          pageTimer = setInterval(() => pageTowardInline(pageX), SCROLLER_PAGE_REPEAT_MS);
        }, SCROLLER_PAGE_HOLD_MS);
      }
    }
    track.setPointerCapture(event.pointerId);
  };

  const onInlineLanePointerMove = (event: PointerEvent): void => {
    const el = view;
    const track = laneInline;
    const current = thumbInline();
    if (!el || !track) return;
    pageX = event.clientX;
    if (draggingInline && current) {
      const box = track.getBoundingClientRect();
      applyLeft(
        resolveScrollerThumbTop({
          pointerY: event.clientX,
          trackTop: box.left,
          grab: grabInline,
          room: Math.max(0, metrics.viewInline - current.height),
        }),
      );
    }
  };

  const onInlineLanePointerUp = (event: PointerEvent): void => {
    draggingInline = false;
    pagingInline = false;
    stopPage();
    setPressedInline(false);
    if (laneInline?.hasPointerCapture(event.pointerId)) laneInline.releasePointerCapture(event.pointerId);
    holdingInline = laneInline?.matches(":hover") === true;
    if (!holdingInline && !holding) scheduleHide();
    paint();
  };

  const onInlineLaneEnter = (): void => {
    if (!host.interactive() || phaseInline() === "none") return;
    holdingInline = true;
    idle = false;
    paint();
    clearHide();
  };

  const onInlineLaneLeave = (): void => {
    if (draggingInline || pagingInline) return;
    holdingInline = false;
    scheduleHide();
    paint();
  };

  const onThumbTransitionEnd = (event: TransitionEvent): void => {
    if (event.target !== event.currentTarget) return;
    if (event.propertyName !== "opacity") return;
    const laneEl = event.currentTarget instanceof Element ? event.currentTarget.closest(".yohu-scroller__lane") : null;
    const inline = laneEl?.getAttribute("data-orient") === "inline";
    if (inline) {
      if (phaseInline() !== "out") return;
      lastInline = undefined;
      lastThumbInline = undefined;
      setPhaseInline("none");
      setThumbInline(undefined);
      return;
    }
    if (phase() !== "out") return;
    last = undefined;
    lastThumb = undefined;
    setPhase("none");
    setThumb(undefined);
  };

  const onNativeScroll = (): void => {
    const el = view;
    if (!el || drive() !== "flow") return;
    const prev = session.offset();
    const next = session.moveTo(el.scrollTop, host.axis() === "both" ? el.scrollLeft : 0);
    if (next.block === prev.block && next.inline === prev.inline) {
      bump();
      return;
    }
    host.onOffset?.(next.block, next.inline);
    bump();
  };

  const detachView = (): void => {
    const el = view;
    if (!el) return;
    el.removeEventListener("scroll", onNativeScroll);
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("keydown", onKeyDown);
  };

  const attachView = (el: HTMLDivElement): void => {
    detachView();
    view = el;
    if (drive() === "flow") el.addEventListener("scroll", onNativeScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("keydown", onKeyDown);
    observe(el);
    paint();
    const off = session.offset();
    host.onOffset?.(off.block, off.inline);
    if (host.barState() === "auto") scheduleHide();
  };

  const attachLane = (el: HTMLDivElement): void => {
    lane = el;
  };

  const attachLaneInline = (el: HTMLDivElement): void => {
    laneInline = el;
  };

  const sync = (): void => {
    if (view) observe(view);
    paint();
    if (host.barState() === "auto") scheduleHide();
  };

  const valueNow = (): number => {
    const range = metrics.contentBlock - metrics.viewBlock;
    if (!(range > 0)) return 0;
    return Math.round((session.offset().block / range) * 100);
  };

  const valueNowInline = (): number => {
    const range = metrics.contentInline - metrics.viewInline;
    if (!(range > 0)) return 0;
    return Math.round((session.offset().inline / range) * 100);
  };

  const destroy = (): void => {
    if (paintFrame !== 0 && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(paintFrame);
      paintFrame = 0;
    }
    detachView();
    session.destroy();
    ro?.disconnect();
    ro = undefined;
    clearHide();
    stopPage();
  };

  return {
    phase,
    phaseInline,
    thumb,
    thumbInline,
    pressed,
    pressedInline,
    gutter,
    gutterInline,
    view: () => view,
    attachView,
    attachLane,
    attachLaneInline,
    scrollTo,
    scrollBy,
    scrollToStart,
    scrollToEnd,
    scrollPage,
    scrollToInline: (left) => applyScrollLeft(left, true),
    offset: () => session.offset().block,
    offsetInline: () => session.offset().inline,
    valueNow,
    valueNowInline,
    sync,
    onLanePointerDown,
    onLanePointerMove,
    onLanePointerUp,
    onLaneEnter,
    onLaneLeave,
    onInlineLanePointerDown,
    onInlineLanePointerMove,
    onInlineLanePointerUp,
    onInlineLaneEnter,
    onInlineLaneLeave,
    onThumbTransitionEnd,
    destroy,
  };
}
