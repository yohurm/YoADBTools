/**
 * YoScroller —— 公共滚条（L4）。
 * 对照 OpenHarmony Scroll + ScrollBar：一对一；无法滚动不显示；系统条不进盒。
 * 内置条 overlay。溢出时视口 padding-inline-end 让出 16vp（data-gutter，官方 hoverWidth），条叠在槽里。
 * Hover/Press GROW 4vp→8vp。默认 BarState.Auto。
 * 禁止侧轨进交叉轴夺滚动口宽。
 * 只组合 binder：订 traveling()（Travel / Collapse / Grow / Rail）、写 attrs、开槽。度量/手势/相位定时在 scroller-binder；偏移数字在 scroller-session。
 * 不知道 Dialog / Chip / Reveal。
 */
import { createRenderEffect, createUniqueId, onCleanup } from "solid-js";
import type { Accessor, JSX } from "solid-js";
import { trueAttr } from "../dom/flag";
import { useCollapseTravel } from "../motion/engines/collapse";
import { useGrow } from "../motion/engines/grow";
import { useRail, railTraveling } from "../motion/engines/rail";
import { useTravel } from "../motion/engines/travel";
import { createScrollerBinder } from "./scroller-binder";
import {
  resolveScrollerAxis,
  resolveScrollerBarState,
  resolveScrollerFade,
  resolveScrollerInteractive,
  scrollerPhaseIsNone,
  type ScrollerAxis,
  type ScrollerBarState,
  type ScrollerExtent,
  type ScrollerFade,
  type ScrollerOverflow,
} from "./scroller-model";
import { scrollerHostAttrs, scrollerLaneAttrs, scrollerThumbAttrs } from "./scroller-policy";
import { ScrollerPortContext, type ScrollerPort } from "./scroller-port";
import "./Scroller.css";

export type { ScrollerAxis, ScrollerBarState, ScrollerExtent, ScrollerFade, ScrollerOverflow } from "./scroller-model";

export type YoScrollerHandle = {
  scrollTo: (top: number) => void;
  scrollBy: (delta: number) => void;
  scrollToStart: () => void;
  scrollToEnd: () => void;
  scrollPage: (next: boolean) => void;
  scrollToInline: (left: number) => void;
  offset: () => number;
  offsetInline: () => number;
  /** 内容总高变了再量一次：过滤变短后收回侧轨，禁止留下 16vp 空白。 */
  sync: () => void;
};

export interface YoScrollerProps {
  /** 视口溢出。默认 auto。hidden 不画条、不接滚轮。 */
  overflow?: ScrollerOverflow;
  /** 对照 BarState。默认 auto。 */
  state?: ScrollerBarState;
  /** 对照 enableScrollInteraction。默认 true；false 仍可用 handle。 */
  interactive?: boolean;
  /** 默认 block 只纵滚。both 才开底轨横滚（日志 clip）。 */
  axis?: ScrollerAxis;
  /**
   * 声明内容尺。虚拟列表传入总高 / 行宽。
   * 有则不再量 in-flow 子盒；缺省仍量短名单。
   */
  extent?: Accessor<ScrollerExtent | undefined>;
  /** 会话偏移。声明尺时内容平面由调用方 transform，视口 scrollTop 恒 0。 */
  onOffset?: (block: number, inline: number) => void;
  /** 视口节点。钉底等只走 handle，禁止模块读原生内容高。 */
  viewRef?: (el: HTMLDivElement) => void;
  handle?: (api: YoScrollerHandle) => void;
  class?: string;
  /** 视口末端淡出。end = 块轴底缘。 */
  fade?: ScrollerFade;
  children: JSX.Element;
}

export function YoScroller(props: YoScrollerProps): JSX.Element {
  const viewId = createUniqueId();
  const travel = useTravel();
  const collapse = useCollapseTravel();
  const grow = useGrow();
  const rail = useRail();
  const overflow = (): ScrollerOverflow => props.overflow ?? "auto";
  const barState = (): ScrollerBarState => resolveScrollerBarState(props.state);
  const interactive = (): boolean => resolveScrollerInteractive(props.interactive);
  const axis = (): ScrollerAxis => resolveScrollerAxis(props.axis);
  const traveling = (): boolean =>
    travel?.traveling() === true ||
    collapse?.traveling() === true ||
    grow?.traveling() === true ||
    (rail != null && railTraveling(rail.phase()));
  const extent = (): ScrollerExtent | undefined => props.extent?.();
  const binder = createScrollerBinder({
    overflow,
    barState,
    interactive,
    traveling,
    axis,
    extent,
    onOffset: (block, inline) => props.onOffset?.(block, inline),
  });
  const handle: YoScrollerHandle = {
    scrollTo: binder.scrollTo,
    scrollBy: binder.scrollBy,
    scrollToStart: binder.scrollToStart,
    scrollToEnd: binder.scrollToEnd,
    scrollPage: binder.scrollPage,
    scrollToInline: binder.scrollToInline,
    offset: binder.offset,
    offsetInline: binder.offsetInline,
    sync: binder.sync,
  };

  createRenderEffect(() => {
    overflow();
    barState();
    interactive();
    axis();
    traveling();
    extent()?.block;
    extent()?.inline;
    binder.sync();
  });

  function releaseScroller(): void {
    binder.destroy();
  }

  function laneClass(): string {
    return "yohu-scroller__lane";
  }

  function thumbClass(): string {
    return "yohu-scroller__thumb";
  }

  function scrollerViewId(): string {
    return viewId;
  }

  function scrollerValueMin(): number {
    return 0;
  }

  function scrollerValueMax(): number {
    return 100;
  }

  function forwardThumbEnd(event: TransitionEvent): void {
    binder.onThumbTransitionEnd(event);
  }

  onCleanup(releaseScroller);

  const host = () =>
    scrollerHostAttrs(
      binder.phase(),
      barState(),
      interactive(),
      axis(),
      binder.gutter(),
      binder.gutterInline(),
      binder.phaseInline(),
    );
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
        data-axis={host()["data-axis"]}
        data-scroll={host()["data-scroll"]}
        data-scroll-inline={host()["data-scroll-inline"]}
        data-bar={host()["data-bar"]}
        data-interactive={host()["data-interactive"]}
        data-gutter={host()["data-gutter"]}
        data-gutter-inline={host()["data-gutter-inline"]}
        data-fade={resolveScrollerFade(props.fade)}
        ref={(el) => {
          planeEl = el;
        }}
      >
        <div
          id={scrollerViewId()}
          class="yohu-scroller__view"
          tabindex={-1}
          ref={(el) => {
            props.viewRef?.(el);
            binder.attachView(el);
            props.handle?.(handle);
            onCleanup(releaseScroller);
          }}
        >
          {props.children}
        </div>
        <div
          class={laneClass()}
          data-orient="block"
          data-lane={scrollerLaneAttrs(binder.phase())["data-lane"]}
          aria-hidden={trueAttr(scrollerPhaseIsNone(binder.phase()))}
          ref={binder.attachLane}
          onPointerDown={binder.onLanePointerDown}
          onPointerMove={binder.onLanePointerMove}
          onPointerUp={binder.onLanePointerUp}
          onPointerCancel={binder.onLanePointerUp}
          onPointerEnter={binder.onLaneEnter}
          onPointerLeave={binder.onLaneLeave}
        >
          <div
            class={thumbClass()}
            role="scrollbar"
            aria-orientation="vertical"
            aria-controls={scrollerViewId()}
            aria-valuemin={scrollerValueMin()}
            aria-valuemax={scrollerValueMax()}
            aria-valuenow={binder.valueNow()}
            data-pressed={scrollerThumbAttrs(binder.pressed())["data-pressed"]}
            onTransitionEnd={forwardThumbEnd}
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
        <div
          class={laneClass()}
          data-orient="inline"
          data-lane={scrollerLaneAttrs(binder.phaseInline())["data-lane"]}
          aria-hidden={trueAttr(scrollerPhaseIsNone(binder.phaseInline()))}
          ref={binder.attachLaneInline}
          onPointerDown={binder.onInlineLanePointerDown}
          onPointerMove={binder.onInlineLanePointerMove}
          onPointerUp={binder.onInlineLanePointerUp}
          onPointerCancel={binder.onInlineLanePointerUp}
          onPointerEnter={binder.onInlineLaneEnter}
          onPointerLeave={binder.onInlineLaneLeave}
        >
          <div
            class={thumbClass()}
            role="scrollbar"
            aria-orientation="horizontal"
            aria-controls={scrollerViewId()}
            aria-valuemin={scrollerValueMin()}
            aria-valuemax={scrollerValueMax()}
            aria-valuenow={binder.valueNowInline()}
            data-pressed={scrollerThumbAttrs(binder.pressedInline())["data-pressed"]}
            onTransitionEnd={forwardThumbEnd}
            style={
              binder.thumbInline()
                ? {
                    width: `${binder.thumbInline()!.height}px`,
                    transform: `translateX(${binder.thumbInline()!.top}px)`,
                  }
                : undefined
            }
          />
        </div>
      </div>
    </ScrollerPortContext.Provider>
  );
}
