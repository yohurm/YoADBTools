import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MotionSpec, motionDurationMs } from "../tokens/motion";
import { DISMISS_HOLD_DURATION, INDICATOR_DURATION, PRESENCE_EXIT_DURATION, SWAP_DURATION } from "./recipes";

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

  it("Presence 出场时长指向 spatialExit / effectsExit / spatialLocal", () => {
    expect(PRESENCE_EXIT_DURATION.dialog).toBe(MotionSpec.spatialExit.duration);
    expect(PRESENCE_EXIT_DURATION.rise).toBe(MotionSpec.effectsExit.duration);
    expect(PRESENCE_EXIT_DURATION.list).toBe(MotionSpec.spatialLocal.duration);
    expect(motionDurationMs(PRESENCE_EXIT_DURATION.rise)).toBe(200);
  });

  it("list 内容与高度同时长，不走面板级 rise 关键帧", () => {
    const css = loadMotionCss();
    expect(css).toContain(".yohu-presence[data-recipe=\"list\"] .yohu-presence__clip");
    const listBlock = css.slice(css.indexOf("配方 list"));
    const untilFold = listBlock.slice(0, listBlock.indexOf("配方 inline-end"));
    expect(untilFold).not.toContain("yohu-rise-in");
    expect(untilFold).toContain("--yohu-space-xs");
    expect(untilFold).toContain("--yohu-motion-spatial-local");
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
});
