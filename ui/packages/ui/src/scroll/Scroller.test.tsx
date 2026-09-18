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
    expect(css).toContain("width: var(--yohu-space-lg)");
    expect(css).toContain("inset-inline-end: var(--yohu-space-xs)");
    expect(css).toContain("width: var(--yohu-space-xs)");
    expect(css).toContain("width: var(--yohu-space-sm)");
    expect(css).toContain("background-color: var(--yohu-fg-3)");
    expect(css).toContain(".yohu-scroller__view {");
    expect(css).toContain("overflow-x: clip");
    expect(css).toContain("overflow-y: hidden");
    expect(css).not.toContain("flex: 0 0 var(--yohu-space-sm)");
    expect(css).not.toContain("!important");
    expect(css).toContain("flex: 1 1 auto");
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
    expect(src).toContain("createScrollerBinder");
    expect(src).toContain("useTravel");
    expect(src).toContain("useCollapseTravel");
    expect(src).toContain("useGrow");
    expect(src).toContain("useRail");
    expect(src).toContain("railTraveling");
    expect(src).toContain("traveling()");
    expect(src).toContain("scrollToEnd");
    expect(src).toContain("scrollToStart");
    expect(src).toContain("scrollPage");
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
    expect(binder).toContain("scrollLeft = 0");
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
});
