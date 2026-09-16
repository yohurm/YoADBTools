import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MotionSpec, motionDurationMs } from "../tokens/motion";
import { DISMISS_HOLD_DURATION, INDICATOR_DURATION, PRESENCE_EXIT_DURATION, SWAP_DURATION, presenceClipProperty, presenceUsesClip } from "./recipes";

function loadMotionCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/tokens/motion.css"),
    resolve(process.cwd(), "packages/ui/src/tokens/motion.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

describe("motion recipes", () => {
  it("配方时长从 MotionSpec 派生，禁止散落毫秒", () => {
    expect(SWAP_DURATION).toBe(MotionSpec.spatialPanel.duration);
    expect(INDICATOR_DURATION).toBe(MotionSpec.spatialSmall.duration);
    expect(DISMISS_HOLD_DURATION).toBe("toast");
    expect(motionDurationMs(DISMISS_HOLD_DURATION)).toBe(3000);
    expect(motionDurationMs(INDICATOR_DURATION)).toBe(150);
  });

  it("指向气泡关键帧走 2xs，不复用菜单 sm rise", () => {
    const css = loadMotionCss();
    expect(css).toContain("@keyframes yohu-tip-in");
    expect(css).toContain("@keyframes yohu-tip-drop-in");
    const tip = css.slice(css.indexOf("@keyframes yohu-tip-in"));
    const untilSlide = tip.slice(0, tip.indexOf("@keyframes yohu-slide-end-in"));
    expect(untilSlide).toContain("--yohu-space-2xs");
    expect(untilSlide).not.toContain("--yohu-space-sm");
  });

  it("Presence 出场时长指向 spatialExit / effectsExit / spatialLocal", () => {
    expect(PRESENCE_EXIT_DURATION.dialog).toBe(MotionSpec.spatialExit.duration);
    expect(PRESENCE_EXIT_DURATION.rise).toBe(MotionSpec.effectsExit.duration);
    expect(PRESENCE_EXIT_DURATION.list).toBe(MotionSpec.spatialLocal.duration);
    expect(PRESENCE_EXIT_DURATION.chip).toBe(MotionSpec.spatialLocal.duration);
    expect(motionDurationMs(PRESENCE_EXIT_DURATION.rise)).toBe(200);
  });

  it("list 内容与高度同时长，不走面板级 rise 关键帧", () => {
    const css = loadMotionCss();
    expect(css).toContain(".yohu-presence[data-recipe=\"list\"] .yohu-presence__clip");
    const listBlock = css.slice(css.indexOf("配方 list"));
    const untilFold = listBlock.slice(0, listBlock.indexOf("配方 chip"));
    expect(untilFold).not.toContain("yohu-rise-in");
    expect(untilFold).toContain("--yohu-space-xs");
    expect(untilFold).toContain("--yohu-motion-spatial-local");
  });

  it("chip 横向裁切宽度，不改铬高", () => {
    expect(presenceUsesClip("chip")).toBe(true);
    expect(presenceClipProperty("chip")).toBe("grid-template-columns");
    expect(presenceClipProperty("list")).toBe("grid-template-rows");
    const css = loadMotionCss();
    const chipBlock = css.slice(css.indexOf("配方 chip"));
    const untilInline = chipBlock.slice(0, chipBlock.indexOf("配方 inline-end"));
    expect(untilInline).toContain("grid-template-columns");
    expect(untilInline).not.toContain("grid-template-rows");
    expect(untilInline).toContain("scale(0.96)");
    expect(untilInline).toContain("--yohu-motion-spatial-local");
  });

  it("主题切换配方关闭默认淡出并按方向叠层", () => {
    const css = loadMotionCss();
    expect(css).toContain("::view-transition-image-pair(root)");
    expect(css).toContain("isolation: auto");
    expect(css).toContain("::view-transition-old(root)");
    expect(css).toContain("::view-transition-new(root)");
    expect(css).toContain("mix-blend-mode: normal");
    expect(css).toContain('[data-theme="light"]::view-transition-old(root)');
    expect(css).toContain('[data-theme="dark"]::view-transition-new(root)');
    expect(css).not.toContain("view-transition-name: yohu-theme-toggle");
    expect(css).not.toContain("@keyframes yohu-theme-keep");
  });

  it("collapse 只裁切，不给子项写 min-height", () => {
    const css = loadMotionCss();
    const collapse = css.slice(css.indexOf("配方：折叠"));
    const inner = collapse.slice(0, collapse.indexOf(".yohu-collapse[data-recipe=\"panel\"]"));
    expect(inner).toContain(".yohu-collapse__inner");
    expect(inner).toContain("overflow: hidden");
    expect(inner).not.toMatch(/\.yohu-collapse__inner\s*>\s*\*/);
    expect(inner).not.toContain("min-height: min-content");
    const panel = collapse.slice(
      collapse.indexOf(".yohu-collapse[data-recipe=\"panel\"]"),
      collapse.indexOf("配方 fill"),
    );
    expect(panel).toContain(".yohu-collapse__content");
    expect(panel).toContain("translateY(var(--yohu-space-xs))");
    expect(panel).not.toContain(".yohu-collapse__inner > *");
    const panelHost = panel.slice(0, panel.indexOf(".yohu-collapse__content"));
    expect(panelHost).not.toContain("overflow: hidden");
    expect(panelHost).not.toContain("transform:");
    expect(panelHost).not.toContain("--yohu-collapse-rows-transition");
    expect(panelHost).toContain("grid-template-rows var(--yohu-motion-spatial-panel)");
  });

  it("YoTravel 当拍 used，双轴同 spec，不点 Dialog", () => {
    const css = loadMotionCss();
    const travel = css.slice(css.indexOf("YoTravel"));
    const untilFill = travel.slice(0, travel.indexOf("配方 fill"));
    expect(untilFill).toContain(".yohu-travel[data-ready][data-axis-block]");
    expect(untilFill).toContain(".yohu-travel[data-ready][data-axis-inline]");
    expect(untilFill).toContain("height var(--yohu-motion-spatial-panel)");
    expect(untilFill).toContain("width var(--yohu-motion-spatial-panel)");
    expect(untilFill).toContain("overflow: hidden");
    expect(untilFill).not.toContain("yohu-dialog");
    expect(untilFill).not.toContain('[data-travel="hold"]');
    expect(untilFill).not.toContain("requestAnimationFrame");
    expect(css).toContain('.yohu-travel:not([data-travel]) .yohu-reveal[data-layout="out"]');
    expect(css).toContain("overflow: clip");
  });

  it("YoReveal 绘制轴始终绝对定位，出流不自裁，不淡入不插行", () => {
    const css = loadMotionCss();
    const reveal = css.slice(css.indexOf("YoReveal"));
    const untilFill = reveal.slice(0, reveal.indexOf("YoTravel"));
    expect(untilFill).toContain('.yohu-reveal[data-layout="out"]');
    expect(untilFill).toContain('.yohu-reveal[data-layout="in"]');
    expect(untilFill).toContain("height: 0");
    expect(untilFill).toContain("min-height: 0");
    expect(untilFill).toContain("--yohu-reveal-span");
    expect(untilFill).toContain("overflow: visible");
    expect(untilFill).not.toContain("overflow: hidden");
    expect(untilFill).toContain(".yohu-reveal__content");
    expect(untilFill).toContain("position: absolute");
    expect(untilFill).not.toContain("opacity");
    expect(untilFill).not.toContain("translateY");
    expect(untilFill).not.toContain("grid-template-rows");
    expect(css).not.toContain('[data-recipe="clip"]');
  });

  it("fill 内层 column flex，__content 填满可收缩，高度仍 0fr/1fr", () => {
    const css = loadMotionCss();
    const fill = css.slice(css.indexOf("配方 fill"));
    const untilRail = fill.slice(0, fill.indexOf(".yohu-recipe-rail"));
    expect(untilRail).toContain('.yohu-collapse[data-recipe="fill"] .yohu-collapse__inner');
    expect(untilRail).toContain("flex-direction: column");
    expect(untilRail).toContain(".yohu-collapse__content");
    expect(untilRail).not.toContain(".yohu-collapse__inner > *");
    expect(untilRail).toContain("flex: 1");
    expect(untilRail).toContain("min-height: 0");
    expect(untilRail).not.toContain("grid-template-rows");
    expect(untilRail).not.toContain("min-height: min-content");
  });

  it("inline-end 双轴插值，禁止高度离散跳变", () => {
    const css = loadMotionCss();
    expect(css).toContain("yohu-recipe-inline-end");
    expect(css).toContain("width: var(--yohu-control-height)");
    expect(css).toContain("width: 100%");
    expect(css).toContain("grid-template-rows: 0fr");
    expect(css).toContain("grid-template-rows: 1fr");
    expect(css).toContain("100cqi");
    expect(css).toContain("--yohu-motion-spatial-panel");
    expect(css).not.toContain("grid-template-columns: 0fr auto");
    expect(css).not.toContain("minmax(0, 1fr) 0fr");
    const inlineBlock = css.slice(css.indexOf("配方 inline-end"));
    const untilCollapse = inlineBlock.slice(0, inlineBlock.indexOf("配方：折叠"));
    expect(untilCollapse).not.toContain("max-height: none");
    expect(untilCollapse).toContain("grid-template-rows var(--yohu-motion-spatial-panel)");
  });

  it("send-aim 有内容朝上，时长走 spatialSmall", () => {
    const css = loadMotionCss();
    expect(css).toContain("yohu-recipe-send-aim");
    expect(css).toContain('.yohu-recipe-send-aim[data-armed="true"] .yohu-icon');
    expect(css).toContain("rotate(-90deg)");
    const sendBlock = css.slice(css.indexOf("配方 send-aim"));
    const untilIndicator = sendBlock.slice(0, sendBlock.indexOf("配方 indicator"));
    expect(untilIndicator).toContain("--yohu-motion-spatial-small");
    expect(untilIndicator).toContain("rotate(0deg)");
    expect(untilIndicator).not.toMatch(/\b\d+ms\b/);
  });

  it("换位行铬在 L1，reduce 覆盖邻行让位", () => {
    const css = loadMotionCss();
    const chrome = css.slice(css.indexOf("配方换位行铬"));
    const untilReduce = chrome.slice(0, chrome.indexOf("reduced-motion"));
    expect(untilReduce).toContain("[data-reordering]");
    expect(untilReduce).toContain("[data-reorder=\"source\"]");
    expect(untilReduce).toContain("[data-reordering] > * > [data-key]:not([data-reorder=\"source\"])");
    expect(untilReduce).toContain("--yohu-motion-spatial-small");
    expect(untilReduce).toContain("--yohu-state-reorder-source");
    expect(untilReduce).not.toContain(".yohu-virtual-list");
    expect(untilReduce).not.toContain(".yohu-reorder-list");
    expect(untilReduce).not.toContain(".yohu-chip");

    const reduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduce).toContain("[data-reordering] > * > [data-key]:not([data-reorder=\"source\"])");
    expect(reduce).not.toContain('.yohu-chip[data-dismiss="hover"] .yohu-chip__remove');
    expect(reduce).toContain(".yohu-recipe-reorder-bar[data-ready]");
    expect(reduce).toContain(".yohu-recipe-reorder-overlay[data-ready]");
    expect(reduce).not.toContain(".yohu-virtual-list[data-reordering] .yohu-virtual-list__row");
    expect(reduce).not.toContain(".yohu-reorder-list[data-reordering] .yohu-reorder-list__row");
  });
});
