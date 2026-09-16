/**
 * YoScroller —— 公共滚条（L4）。
 * 对照 OpenHarmony ScrollBar：与视口一对一；无法滚动不显示；系统条关掉。
 * 溢出只量 in-flow 子盒。订 YoTravel.traveling()：插值中不新出条、RO 不改相位。
 * 收回留上一拍滑块淡出。滑块可拖，轨道可点。显隐走 effects 透明度，不是 travel。
 * 不知道 Dialog / Chip / Reveal。
 */
import { children, createRenderEffect, createSignal, createUniqueId, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { shouldSkipMotion } from "../motion/reduced";
import { useTravel } from "../motion/travel";
import {
  resolveScrollerFlowChild,
  resolveScrollerFlowSize,
  resolveScrollerOverflow,
  resolveScrollerPhase,
  resolveScrollerScrollEnd,
  resolveScrollerScrollTop,
  resolveScrollerThumb,
  resolveScrollerThumbTop,
  type ScrollerPhase,
  type ScrollerThumb,
} from "./scroller-model";
import { scrollerHostAttrs, scrollerLaneAttrs } from "./scroller-policy";
import "./Scroller.css";

export type YoScrollerHandle = {
  scrollToEnd: () => void;
};

export interface YoScrollerProps {
  /** 视口溢出。默认 auto。hidden 不画条。 */
  overflow?: "auto" | "hidden";
  /** 视口节点。钉底等只走 handle，禁止模块读原生内容高。 */
  viewRef?: (el: HTMLDivElement) => void;
  handle?: (api: YoScrollerHandle) => void;
  class?: string;
  children: JSX.Element;
}

export function YoScroller(props: YoScrollerProps): JSX.Element {
  const viewId = createUniqueId();
  const kids = children(() => props.children);
  const travel = useTravel();
  const [phase, setPhase] = createSignal<ScrollerPhase>("none");
  const [thumb, setThumb] = createSignal<ScrollerThumb | undefined>();
  let view: HTMLDivElement | undefined;
  let lane: HTMLDivElement | undefined;
  let last: ScrollerPhase | undefined;
  let lastThumb: ScrollerThumb | undefined;
  let dragging = false;
  let grab = 0;

  const overflow = (): "auto" | "hidden" => props.overflow ?? "auto";
  const traveling = (): boolean => travel?.traveling() === true;

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

  const paint = (): void => {
    const el = view;
    if (!el || overflow() === "hidden") {
      last = undefined;
      lastThumb = undefined;
      setPhase("none");
      setThumb(undefined);
      return;
    }
    const all = measureFlow(el);
    const overflowing = resolveScrollerOverflow(el.clientHeight, all);
    const measured = overflowing
      ? resolveScrollerThumb({
          view: el.clientHeight,
          all,
          top: el.scrollTop,
        })
      : undefined;
    if (shouldSkipMotion()) {
      last = overflowing ? "on" : undefined;
      lastThumb = measured;
      setPhase(overflowing ? "on" : "none");
      setThumb(measured);
      return;
    }
    const next = resolveScrollerPhase({ overflowing, traveling: traveling(), prev: last });
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

  const scrollToEnd = (): void => {
    const el = view;
    if (!el) return;
    el.scrollTop = resolveScrollerScrollEnd(el.clientHeight, measureFlow(el));
    paint();
  };

  const applyTop = (thumbTop: number): void => {
    const el = view;
    const current = thumb();
    if (!el || !current) return;
    el.scrollTop = resolveScrollerScrollTop({
      view: el.clientHeight,
      all: measureFlow(el),
      thumbHeight: current.height,
      thumbTop,
    });
    paint();
  };

  const onLanePointerDown = (event: PointerEvent): void => {
    const el = view;
    const track = lane;
    const current = thumb();
    if (!el || !track || phase() === "none" || phase() === "out" || !current) return;
    event.preventDefault();
    const box = track.getBoundingClientRect();
    const room = Math.max(0, el.clientHeight - current.height);
    const onThumb =
      event.target instanceof HTMLElement && event.target.classList.contains("yohu-scroller__thumb");
    grab = onThumb ? event.clientY - (box.top + current.top) : current.height / 2;
    applyTop(
      resolveScrollerThumbTop({
        pointerY: event.clientY,
        trackTop: box.top,
        grab,
        room,
      }),
    );
    dragging = true;
    track.setPointerCapture(event.pointerId);
  };

  const onLanePointerMove = (event: PointerEvent): void => {
    const el = view;
    const track = lane;
    const current = thumb();
    if (!dragging || !el || !track || !current) return;
    const box = track.getBoundingClientRect();
    applyTop(
      resolveScrollerThumbTop({
        pointerY: event.clientY,
        trackTop: box.top,
        grab,
        room: Math.max(0, el.clientHeight - current.height),
      }),
    );
  };

  const onLanePointerUp = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    if (lane?.hasPointerCapture(event.pointerId)) lane.releasePointerCapture(event.pointerId);
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

  createRenderEffect(() => {
    kids();
    overflow();
    travel?.traveling();
    paint();
  });

  const valueNow = (): number => {
    const el = view;
    if (!el) return 0;
    const range = measureFlow(el) - el.clientHeight;
    if (!(range > 0)) return 0;
    return Math.round((el.scrollTop / range) * 100);
  };

  return (
    <div
      class={`yohu-scroller${props.class ? ` ${props.class}` : ""}`}
      data-overflow={overflow()}
      data-scroll={scrollerHostAttrs(phase())["data-scroll"]}
    >
      <div
        id={viewId}
        class="yohu-scroller__view"
        ref={(el) => {
          view = el;
          props.viewRef?.(el);
          props.handle?.({ scrollToEnd });
          el.addEventListener("scroll", paint, { passive: true });
          let ro: ResizeObserver | undefined;
          if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(() => {
              if (traveling()) return;
              paint();
            });
            ro.observe(el);
          }
          onCleanup(() => {
            el.removeEventListener("scroll", paint);
            ro?.disconnect();
          });
          paint();
        }}
      >
        {kids()}
      </div>
      <div
        class="yohu-scroller__lane"
        data-lane={scrollerLaneAttrs(phase())["data-lane"]}
        aria-hidden={phase() === "none" ? true : undefined}
        ref={(el) => {
          lane = el;
        }}
        onPointerDown={onLanePointerDown}
        onPointerMove={onLanePointerMove}
        onPointerUp={onLanePointerUp}
        onPointerCancel={onLanePointerUp}
      >
        <div
          class="yohu-scroller__thumb"
          role="scrollbar"
          aria-orientation="vertical"
          aria-controls={viewId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={valueNow()}
          onTransitionEnd={onThumbTransitionEnd}
          style={
            thumb()
              ? {
                  height: `${thumb()!.height}px`,
                  transform: `translateY(${thumb()!.top}px)`,
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
