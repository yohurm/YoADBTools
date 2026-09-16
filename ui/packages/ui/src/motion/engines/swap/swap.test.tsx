import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { loadMotionCss, loadMotionLayerCss } from "../../css";
import { YoSwap } from "./index";

function loadFile(rel: string): string {
  const candidates = [
    resolve(process.cwd(), rel),
    resolve(process.cwd(), `packages/ui/${rel}`),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

describe("YoSwap", () => {
  it("keys 变化后面名跟着变（测试环境跳过换牌等待）", () => {
    const [label, setLabel] = createSignal("预览");
    render(() => <YoSwap keys={label()}>{label()}</YoSwap>);
    expect(screen.getByText("预览")).toBeTruthy();
    expect(document.querySelector(".yohu-swap")?.getAttribute("data-anchor")).toBe("end");
    expect(document.querySelector(".yohu-swap")?.getAttribute("data-phase")).toBe("idle");
    setLabel("收起预览");
    expect(screen.getByText("收起预览")).toBeTruthy();
    expect(screen.queryByText("预览")).toBeNull();
    expect(document.querySelector(".yohu-swap")?.getAttribute("data-resizing")).toBeNull();
    expect(document.querySelector(".yohu-swap")?.getAttribute("data-phase")).toBe("idle");
  });

  it("center / start 仍公开，默认不写 center", () => {
    render(() => (
      <YoSwap keys="取消" anchor="center">
        取消
      </YoSwap>
    ));
    expect(document.querySelector(".yohu-swap")?.getAttribute("data-anchor")).toBe("center");
    render(() => (
      <YoSwap keys="左" anchor="start">
        左
      </YoSwap>
    ));
    const hosts = document.querySelectorAll(".yohu-swap");
    expect(hosts[1]?.getAttribute("data-anchor")).toBe("start");
  });

  it("先换目标文案再插槽宽，禁止收到尽头再换字", () => {
    const src = `${loadFile("src/motion/engines/swap/swap.tsx")}\n${loadFile("src/motion/engines/swap/swap-model.ts")}\n${loadFile("src/motion/engines/swap/swap-policy.ts")}`;
    expect(src).toContain("先换目标文案");
    expect(src).toContain("inner.offsetWidth");
    expect(src).not.toMatch(/\.getBoundingClientRect\s*\(/);
    expect(src).not.toContain("requestAnimationFrame");
    expect(src).toContain("setView(() => incoming)");
    expect(src).toContain("holdSwapSession");
    expect(src).toContain("cleanupSwapGeneration");
    expect(src).not.toContain("measureWidth");
    expect(src).not.toContain("pending");
    expect(src).not.toContain("shrinking");
    expect(src).not.toContain("收完再换");
    expect(loadFile("src/motion/engines/swap/swap.tsx")).toContain("setClipW(undefined)");
  });

  it("idle hug 字宽，只在 resizing 锁宽并裁切", () => {
    const css = loadMotionLayerCss("engines/swap/swap.css") || loadMotionCss();
    const start = css.indexOf(".yohu-swap {");
    const end = css.indexOf(".yohu-swap__inner");
    const block = start >= 0 && end >= 0 ? css.slice(start, css.indexOf("}", end) + 1) : css;
    expect(block).toContain("min-width: min-content");
    expect(block).toContain('[data-phase="resizing"]');
    expect(block).toContain("overflow: hidden");
    expect(block).toContain("var(--yohu-motion-spatial-panel)");
    const base = block.match(/\.yohu-swap__clip\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(base).toContain("min-width: min-content");
    expect(base).not.toContain("overflow: hidden");
    expect(base).not.toContain("min-width: 0");
  });

  it("spatialPanel 只裁 width，禁止交叉淡入淡出", () => {
    const css = loadMotionLayerCss("engines/swap/swap.css");
    expect(css).toContain("var(--yohu-motion-spatial-panel)");
    expect(css).toContain("transition: width var(--yohu-motion-spatial-panel)");
    expect(css).not.toContain("opacity");
    expect(css).not.toContain("cross-fade");
    expect(css).not.toContain("@keyframes");
    expect(css).not.toContain("yohu-swap__outgoing");
  });
});
