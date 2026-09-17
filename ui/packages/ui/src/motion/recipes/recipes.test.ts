import { describe, expect, it } from "vitest";

import { loadMotionLayerCss } from "../css";

describe("L3 recipe CSS", () => {
  it("preview 只插列宽，不写 width 过渡", () => {
    const css = loadMotionLayerCss("recipes/preview.css");
    expect(css).toContain(".yohu-recipe-preview");
    expect(css).toContain("grid-template-columns var(--yohu-motion-spatial-panel)");
    expect(css).not.toContain("transition: width");
    expect(css).not.toMatch(/\b\d+ms\b/);
  });

  it("inline-end 双轴同拍，禁止离散 max-height", () => {
    const css = loadMotionLayerCss("recipes/inline-end.css");
    expect(css).toContain("yohu-recipe-inline-end");
    expect(css).toContain("grid-template-rows: 0fr");
    expect(css).toContain("grid-template-rows: 1fr");
    expect(css).toContain("grid-template-rows var(--yohu-motion-spatial-panel)");
    expect(css).toContain("100cqi");
    expect(css).toContain("align-items: flex-start");
    expect(css).not.toContain("min-height: min-content");
    expect(css).not.toContain("max-height: none");
    expect(css).not.toContain("grid-template-columns: 0fr auto");
  });

  it("send-aim 转向上，时长 spatial-small", () => {
    const css = loadMotionLayerCss("recipes/send-aim.css");
    expect(css).toContain("yohu-recipe-send-aim");
    expect(css).toContain("rotate(-90deg)");
    expect(css).toContain("--yohu-motion-spatial-small");
    expect(css).not.toMatch(/\b\d+ms\b/);
  });

  it("dismiss-fade 停留后再淡出，延迟用 token 相减", () => {
    const css = loadMotionLayerCss("recipes/dismiss-fade.css");
    expect(css).toContain("yohu-recipe-dismiss-fade");
    expect(css).toContain("yohu-fade-out");
    expect(css).toContain("var(--yohu-motion-spatial-panel)");
    expect(css).toContain("calc(var(--yohu-dur-toast) - var(--yohu-dur-slow))");
  });

  it("tree-chevron 只转 transform", () => {
    const css = loadMotionLayerCss("recipes/tree-chevron.css");
    expect(css).toContain("yohu-recipe-tree-chevron");
    expect(css).toContain("transform var(--yohu-motion-spatial-small)");
    expect(css).toContain("rotate(-90deg)");
    expect(css).toContain("yohu-recipe-tree-chevron--open");
  });

  it("scroller 滑块只过渡透明度与 Hover 色", () => {
    const css = loadMotionLayerCss("recipes/scroller.css");
    expect(css).toContain(".yohu-scroller__thumb");
    expect(css).toContain("opacity var(--yohu-motion-effects-enter)");
    expect(css).toContain("opacity var(--yohu-motion-effects-exit)");
    expect(css).toContain("background-color var(--yohu-motion-effects-fast)");
    expect(css).not.toContain("height");
    expect(css).not.toContain("transform");
  });

  it("reorder 铬在 L3，不绑虚拟列表选择器", () => {
    const css = loadMotionLayerCss("recipes/reorder.css");
    expect(css).toContain("[data-reordering]");
    expect(css).toContain("[data-reordering] [data-key]");
    expect(css).toContain('[data-reordering] [data-key]:not([data-reorder="source"])');
    expect(css).toContain('[data-reordering] [data-reorder="source"]');
    expect(css).toContain("--yohu-motion-spatial-small");
    expect(css).not.toContain("> * > [data-key]");
    expect(css).not.toContain("__view");
    expect(css).not.toContain(".yohu-virtual-list");
    expect(css).not.toContain(".yohu-reorder-list");
  });
});
