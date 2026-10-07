import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";

import { YoScroller, type YoScrollerHandle } from "./Scroller";
import { useScrollerPort } from "./scroller-port";

function load(rel: string): string {
  const candidates = [
    resolve(process.cwd(), rel),
    resolve(process.cwd(), `packages/ui/${rel}`),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate, "utf-8");
  }
  return "";
}

describe("YoScroller", () => {
  it("视口关原生条，侧轨默认识 off，滑块可点", () => {
    const { container } = render(() => (
      <YoScroller>
        <p>名单</p>
      </YoScroller>
    ));
    expect(container.querySelector(".yohu-scroller__view")?.textContent).toBe("名单");
    expect(container.querySelector(".yohu-scroller__lane")?.getAttribute("data-lane")).toBe("off");
    expect(container.querySelector(".yohu-scroller__thumb")?.getAttribute("role")).toBe("scrollbar");
    expect(container.querySelector(".yohu-scroller")?.getAttribute("data-bar")).toBe("auto");
  });

  it("溢出让出侧轨，滑块在轨里，视口不留系统条", () => {
    const css = load("src/scroll/Scroller.css");
    expect(css).toContain("flex-direction: column");
    expect(css).toContain('[data-gutter="on"] > .yohu-scroller__view');
    expect(css).toContain("padding-inline-end: var(--yohu-space-lg)");
    expect(css).toContain("inset-inline-end: 0");
    expect(css).toContain(".yohu-scroller__lane");
    expect(css).toContain("opacity var(--yohu-motion-effects-enter)");
    expect(css).toContain("opacity var(--yohu-motion-effects-exit)");
    expect(css).toContain("background-color var(--yohu-motion-effects-fast)");
    expect(css).toContain("width var(--yohu-motion-effects-fast)");
    expect(css).toContain("width: var(--yohu-space-lg)");
    expect(css).toContain("inset-inline-end: var(--yohu-space-xs)");
    expect(css).toContain("width: var(--yohu-space-xs)");
    expect(css).toContain("width: var(--yohu-space-sm)");
    expect(css).toContain("background-color: var(--yohu-fg-3)");
    expect(css).toContain(".yohu-scroller__view {");
    expect(css).toContain("overflow-x: clip");
    expect(css).toContain("overflow-y: hidden");
    expect(css).toContain('[data-axis="both"] > .yohu-scroller__view');
    expect(css).toContain('[data-gutter-inline="on"] > .yohu-scroller__view');
    expect(css).toContain('[data-orient="block"]');
    expect(css).toContain('[data-orient="inline"]');
    expect(css).not.toContain("flex: 0 0 var(--yohu-space-sm)");
    expect(css).not.toContain("!important");
    expect(css).toContain("flex: var(--yohu-scroll-flex, 1 1 auto)");
    expect(css).toContain("max-height: var(--yohu-scroll-max-block, none)");
    expect(css).not.toContain("flex: 1 1 0");
    expect(css).not.toContain('[data-overflow="auto"] > .yohu-scroller__view');
    expect(css).toContain("overscroll-behavior: contain");
    expect(css).not.toMatch(/overflow-y\s*:\s*auto/);
    expect(css).not.toContain("scrollbar-width");
    expect(css).toContain("touch-action: none");
    expect(css).toContain('[data-scroll="out"]');
    expect(css).not.toContain("yohu-dialog");
    const src = load("src/scroll/Scroller.tsx");
    const binder = load("src/scroll/scroller-binder.ts");
    expect(src).toContain("extent");
    expect(src).toContain("extent()?.block");
    expect(binder).toContain("createScrollerBinder");
    expect(src).toContain("useTravel");
    expect(src).toContain("useCollapseTravel");
    expect(src).toContain("useGrow");
    expect(src).toContain("useRail");
    expect(src).toContain("railTraveling");
    expect(src).toContain("traveling()");
    expect(src).toContain("scrollToEnd");
    expect(src).toContain("scrollToStart");
    expect(src).toContain("scrollPage");
    expect(src).toContain("scrollToInline");
    expect(src).toContain("offsetInline");
    expect(src).toContain('data-orient="inline"');
    expect(src).toContain("ScrollerPortContext.Provider");
    expect(src).toContain("plane:");
    expect(src).toMatch(/const handle: YoScrollerHandle = \{[\s\S]*scrollTo: binder\.scrollTo/);
    expect(src).toContain("sync: binder.sync");
    expect(src).not.toMatch(/const port: ScrollerPort = \{[\s\S]*scrollTo:/);
    expect(src).not.toContain("scrollHeight");
    expect(src).not.toContain('closest("[data-travel]")');
    expect(src).not.toContain("yohu-dialog");
    expect(src).not.toContain("export { useScrollerPort }");
    expect(src).not.toContain("export type { ScrollerPort }");
    expect(src).not.toContain('querySelector(".yohu-scroller__view")');
    expect(src).not.toMatch(/overflow-y\s*:\s*auto/);
    expect(binder).toContain("setPointerCapture");
    expect(binder).toContain("resolveScrollerFlowSize");
    expect(binder).toContain("resolveScrollerFlowChild");
    expect(binder).toContain("resolveScrollerGutter");
    expect(binder).toContain("resolveScrollerWheelDelta");
    expect(binder).toContain("resolveScrollerPageTop");
    expect(binder).toContain("SCROLLER_AUTO_HIDE_MS");
    expect(binder).toContain("SCROLLER_PAGE_HOLD_MS");
    expect(binder).toContain("SCROLLER_PAGE_REPEAT_MS");
    expect(binder).toContain("onWheel");
    expect(binder).toContain("lastThumb");
    expect(binder).toContain("ResizeObserver");
    expect(binder).toContain("applyScrollTop");
    expect(binder).toContain("applyScrollLeft");
    expect(binder).toContain("createScrollerSession");
    expect(binder).toContain("writeFlowDom");
    expect(binder).toContain("resolveScrollerDrive");
    expect(binder).toContain("host.onOffset");
    expect(binder).toContain("el.scrollTop = off.block");
    expect(binder).toContain("resolveScrollerContentBox");
    expect(binder).toContain("schedulePaint");
    expect(binder).toContain("host.extent");
    expect(binder).toContain("scrollLeft = 0");
    expect(binder).toContain("scrollerDriveIsFlow");
    expect(binder).not.toContain('host.axis() === "block"');
    expect(binder).not.toContain('drive() === "flow"');
    expect(binder).not.toContain('drive() !== "flow"');
    expect(binder).not.toContain('!== "out"');
    expect(binder).not.toContain("scrollHeight");
    expect(binder).not.toContain("yohu-dialog");
    expect(binder).not.toMatch(/overflow-y\s*:\s*auto/);
    expect(binder).not.toContain("!important");
  });

  it("同族经 ScrollerPort 读滚口，不 scrape class", () => {
    let port: ReturnType<typeof useScrollerPort>;
    let handle: YoScrollerHandle | undefined;
    const Probe = () => {
      port = useScrollerPort();
      return <span>探针</span>;
    };
    const { container } = render(() => (
      <YoScroller handle={(api) => {
        handle = api;
      }}>
        <Probe />
      </YoScroller>
    ));
    const view = container.querySelector(".yohu-scroller__view") as HTMLDivElement;
    const plane = container.querySelector(".yohu-scroller") as HTMLDivElement;
    expect(port?.view()).toBe(view);
    expect(port?.plane()).toBe(plane);
    expect(port?.plane()).not.toBe(view);
    expect(plane.contains(view)).toBe(true);
    expect(port?.scrollTop()).toBe(view.scrollTop);
    expect(port?.clientHeight()).toBe(view.clientHeight);
    expect(handle?.scrollTo).toBeTypeOf("function");
    expect(port).not.toHaveProperty("scrollTo");
  });

  it("声明尺：会话偏移不写视口 scrollTop", () => {
    let handle: YoScrollerHandle | undefined;
    const { container } = render(() => (
      <YoScroller
        extent={() => ({ block: 400 })}
        handle={(api) => {
          handle = api;
        }}
      >
        <p>名单</p>
      </YoScroller>
    ));
    const view = container.querySelector(".yohu-scroller__view") as HTMLDivElement;
    Object.defineProperty(view, "clientHeight", { value: 100, configurable: true });
    handle?.sync();
    handle?.scrollTo(80);
    expect(handle?.offset()).toBe(80);
    expect(view.scrollTop).toBe(0);
  });

  it("视口监听经 listen 成对摘掉", () => {
    const src = load("src/scroll/scroller-binder.ts");
    expect(src.split("add" + "EventListener").length - 1).toBe(1);
    expect(src.split("remove" + "EventListener").length - 1).toBe(1);
    expect(src).toContain('listen(el, "scroll", onNativeScroll, { passive: true })');
    expect(src).toContain('listen(el, "wheel", onWheel, { passive: false })');
    expect(src).toContain('listen(el, "keydown", onKeyDown)');
    expect(src).toContain("scrollerDriveIsFlow(drive())");
  });
});

describe("滚轴拦住默认", () => {
  it("滚轮、按键和两条滑轨都拦住默认", () => {
    const src = load("src/scroll/scroller-binder.ts");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("event." + "preventDefault()")).toBe(1);
    expect(times("function blockEvent")).toBe(1);
    expect(times("export function blockEvent")).toBe(0);
    expect(times("blockEvent(event)")).toBe(5);
  });
});

describe("滚轴点在滑块", () => {
  it("纵轨和横轨都问指针是不是在滑块上", () => {
    const src = load("src/scroll/scroller-binder.ts");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times('classList.contains("' + 'yohu-scroller__thumb")')).toBe(1);
    expect(times("function pointerOnThumb")).toBe(1);
    expect(times("export function pointerOnThumb")).toBe(0);
    expect(times("pointerOnThumb(event)")).toBe(2);
  });
});

describe("滚轴卸绑", () => {
  it("宿主和视口都卸同一把绑定", () => {
    const src = load("src/scroll/Scroller.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("binder." + "destroy()")).toBe(1);
    expect(times("function releaseScroller")).toBe(1);
    expect(times("export function releaseScroller")).toBe(0);
    expect(times("onCleanup(releaseScroller)")).toBe(2);
  });
});

describe("滚轴轨道类名", () => {
  it("纵轨和横轨都用同一条轨道类名", () => {
    const src = load("src/scroll/Scroller.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times('class="' + 'yohu-scroller__lane"')).toBe(0);
    expect(times('return "' + 'yohu-scroller__lane"')).toBe(1);
    expect(times("function laneClass")).toBe(1);
    expect(times("export function laneClass")).toBe(0);
    expect(times("laneClass()")).toBe(3);
  });
});

describe("滚轴滑块类名", () => {
  it("纵滑块和横滑块都用同一条滑块类名", () => {
    const src = load("src/scroll/Scroller.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times('class="' + 'yohu-scroller__thumb"')).toBe(0);
    expect(times('return "' + 'yohu-scroller__thumb"')).toBe(1);
    expect(times("function thumbClass")).toBe(1);
    expect(times("export function thumbClass")).toBe(0);
    expect(times("thumbClass()")).toBe(3);
  });
});

describe("滚轴视口标识", () => {
  it("视口和两条滑块都用同一标识", () => {
    const src = load("src/scroll/Scroller.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("id={" + "viewId}")).toBe(0);
    expect(times("aria-controls={" + "viewId}")).toBe(0);
    expect(times("return " + "viewId")).toBe(1);
    expect(times("function scrollerViewId")).toBe(1);
    expect(times("export function scrollerViewId")).toBe(0);
    expect(times("scrollerViewId()")).toBe(4);
  });
});

describe("滚轴最小值", () => {
  it("两条滑块的最小值都是 0", () => {
    const src = load("src/scroll/Scroller.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("aria-valuemin={" + "0}")).toBe(0);
    expect(times("return " + "0")).toBe(1);
    expect(times("function scrollerValueMin")).toBe(1);
    expect(times("export function scrollerValueMin")).toBe(0);
    expect(times("scrollerValueMin()")).toBe(3);
  });
});

describe("滚轴最大值", () => {
  it("两条滑块的最大值都是 100", () => {
    const src = load("src/scroll/Scroller.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("aria-valuemax={" + "100}")).toBe(0);
    expect(times("return " + "100")).toBe(1);
    expect(times("function scrollerValueMax")).toBe(1);
    expect(times("export function scrollerValueMax")).toBe(0);
    expect(times("scrollerValueMax()")).toBe(3);
  });
});

describe("滚轴过渡结束", () => {
  it("两条滑块都把过渡结束交给同一回调", () => {
    const src = load("src/scroll/Scroller.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("onTransitionEnd={" + "binder.onThumbTransitionEnd}")).toBe(0);
    expect(times("binder.onThumbTransitionEnd(" + "event)")).toBe(1);
    expect(times("function forwardThumbEnd")).toBe(1);
    expect(times("export function forwardThumbEnd")).toBe(0);
    expect(times("onTransitionEnd={forwardThumbEnd}")).toBe(2);
  });
});
