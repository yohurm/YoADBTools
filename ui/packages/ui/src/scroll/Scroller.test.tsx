import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";

import { YoScroller } from "./Scroller";

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
  });

  it("几何预留 8vp 侧轨，滑块可点，收回 out 才不接指针，不点 Dialog", () => {
    const css = load("src/scroll/Scroller.css");
    expect(css).toContain("flex: 0 0 var(--yohu-space-sm)");
    expect(css).toContain("position: relative");
    expect(css).toContain("scrollbar-width: none");
    expect(css).toContain("touch-action: none");
    expect(css).toContain('[data-scroll="out"]');
    expect(css).not.toContain("yohu-dialog");
    const src = load("src/scroll/Scroller.tsx");
    expect(src).toContain("setPointerCapture");
    expect(src).toContain("resolveScrollerFlowSize");
    expect(src).toContain("resolveScrollerFlowChild");
    expect(src).toContain("useTravel");
    expect(src).toContain("traveling()");
    expect(src).toContain("lastThumb");
    expect(src).toContain("resolveScrollerScrollEnd");
    expect(src).toContain("scrollToEnd");
    expect(src).not.toContain("scrollHeight");
    expect(src).not.toContain("closest(");
    expect(src).not.toContain("yohu-dialog");
  });
});
