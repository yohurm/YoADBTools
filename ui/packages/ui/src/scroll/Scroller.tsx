/**
 * YoScroller —— 公共滚条（L4）。
 * 对照 OpenHarmony Scroll + ScrollBar：一对一；无法滚动不显示；系统条不进盒。
 * 内置条 overlay。溢出时视口 padding-inline-end 让出 16vp（data-gutter，官方 hoverWidth），条叠在槽里。
 * Hover/Press GROW 4vp→8vp。默认 BarState.Auto。
 * 禁止侧轨进交叉轴夺滚动口宽。
 * 只组合 binder：订 traveling()（Travel / Collapse / Grow / Rail）、写 attrs、开槽。度量/手势/相位定时在 scroller-binder。
 * 不知道 Dialog / Chip / Reveal。
 */
import { createRenderEffect, createUniqueId, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { useCollapseTravel } from "../motion/engines/collapse";
import { useGrow } from "../motion/engines/grow";
import { useRail, railTraveling } from "../motion/engines/rail";
import { useTravel } from "../motion/engines/travel";
import { createScrollerBinder } from "./scroller-binder";
import { resolveScrollerBarState, resolveScrollerInteractive, type ScrollerBarState } from "./scroller-model";
import { scrollerHostAttrs, scrollerLaneAttrs, scrollerThumbAttrs } from "./scroller-policy";
import { ScrollerPortContext, type ScrollerPort } from "./scroller-port";
import "./Scroller.css";

export type { ScrollerBarState } from "./scroller-model";

export type YoScrollerHandle = {
  scrollTo: (top: number) => void;
  scrollBy: (delta: number) => void;
  scrollToStart: () => void;
  scrollToEnd: () => void;
  scrollPage: (next: boolean) => void;
  offset: () => number;
};

export interface YoScrollerProps {
  /** 视口溢出。默认 auto。hidden 不画条、不接滚轮。 */
  overflow?: "auto" | "hidden";
  /** 对照 BarState。默认 auto。 */
  state?: ScrollerBarState;
  /** 对照 enableScrollInteraction。默认 true；false 仍可用 handle。 */
  interactive?: boolean;
  /** 视口节点。钉底等只走 handle，禁止模块读原生内容高。 */
  viewRef?: (el: HTMLDivElement) => void;
  handle?: (api: YoScrollerHandle) => void;
  class?: string;
  children: JSX.Element;
}

export function YoScroller(props: YoScrollerProps): JSX.Element {
  const viewId = createUniqueId();
  const travel = useTravel();
  const collapse = useCollapseTravel();
  const grow = useGrow();
  const rail = useRail();
  const overflow = (): "auto" | "hidden" => props.overflow ?? "auto";
  const barState = (): ScrollerBarState => resolveScrollerBarState(props.state);
  const interactive = (): boolean => resolveScrollerInteractive(props.interactive);
  const traveling = (): boolean =>
    travel?.traveling() === true ||
    collapse?.traveling() === true ||
    grow?.traveling() === true ||
    (rail != null && railTraveling(rail.phase()));
  const binder = createScrollerBinder({ overflow, barState, interactive, traveling });
  const handle: YoScrollerHandle = {
    scrollTo: binder.scrollTo,
    scrollBy: binder.scrollBy,
    scrollToStart: binder.scrollToStart,
    scrollToEnd: binder.scrollToEnd,
    scrollPage: binder.scrollPage,
    offset: binder.offset,
  };

  createRenderEffect(() => {
    props.children;
    overflow();
    barState();
    interactive();
    traveling();
    binder.sync();
  });

  onCleanup(() => binder.destroy());

  const host = () => scrollerHostAttrs(binder.phase(), barState(), interactive(), binder.gutter());
  let planeEl: HTMLDivElement | undefined;
  const port: ScrollerPort = {
    view: () => binder.view(),
    plane: () => planeEl,
    scrollTop: () => binder.offset(),
    clientHeight: () => binder.view()?.clientHeight ?? 0,
  };

  return (
    <ScrollerPortContext.Provider value={port}>
      <div
        class={`yohu-scroller${props.class ? ` ${props.class}` : ""}`}
        data-overflow={overflow()}
        data-scroll={host()["data-scroll"]}
        data-bar={host()["data-bar"]}
        data-interactive={host()["data-interactive"]}
        data-gutter={host()["data-gutter"]}
        ref={(el) => {
          planeEl = el;
        }}
      >
        <div
          id={viewId}
          class="yohu-scroller__view"
          tabindex={-1}
          ref={(el) => {
            binder.attachView(el);
            props.viewRef?.(el);
            props.handle?.(handle);
            onCleanup(() => binder.destroy());
          }}
        >
          {props.children}
        </div>
        <div
          class="yohu-scroller__lane"
          data-lane={scrollerLaneAttrs(binder.phase())["data-lane"]}
          aria-hidden={binder.phase() === "none" ? true : undefined}
          ref={binder.attachLane}
          onPointerDown={binder.onLanePointerDown}
          onPointerMove={binder.onLanePointerMove}
          onPointerUp={binder.onLanePointerUp}
          onPointerCancel={binder.onLanePointerUp}
          onPointerEnter={binder.onLaneEnter}
          onPointerLeave={binder.onLaneLeave}
        >
          <div
            class="yohu-scroller__thumb"
            role="scrollbar"
            aria-orientation="vertical"
            aria-controls={viewId}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={binder.valueNow()}
            data-pressed={scrollerThumbAttrs(binder.pressed())["data-pressed"]}
            onTransitionEnd={binder.onThumbTransitionEnd}
            style={
              binder.thumb()
                ? {
                    height: `${binder.thumb()!.height}px`,
                    transform: `translateY(${binder.thumb()!.top}px)`,
                  }
                : undefined
            }
          />
        </div>
      </div>
    </ScrollerPortContext.Provider>
  );
}
