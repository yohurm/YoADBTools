import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { YoSwap } from "./swap";

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

function loadSwapCss(): string {
  const css = loadFile("src/tokens/motion.css");
  const start = css.indexOf(".yohu-swap {");
  const end = css.indexOf(".yohu-swap__inner");
  if (start < 0 || end < 0) {
    return "";
  }
  return css.slice(start, css.indexOf("}", end) + 1);
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
    const src = `${loadFile("src/motion/swap.tsx")}\n${loadFile("src/motion/swap-model.ts")}\n${loadFile("src/motion/swap-policy.ts")}`;
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
    expect(loadFile("src/motion/swap.tsx")).toContain("setClipW(undefined)");
  });

  it("idle hug 字宽，只在 resizing 锁宽并裁切", () => {
    const css = loadSwapCss();
    expect(css).toContain("min-width: min-content");
    expect(css).toContain('[data-phase="resizing"]');
    expect(css).toContain("overflow: hidden");
    expect(css).toContain("var(--yohu-motion-spatial-panel)");
    const base = css.match(/\.yohu-swap__clip\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(base).toContain("min-width: min-content");
    expect(base).not.toContain("overflow: hidden");
    expect(base).not.toContain("min-width: 0");
  });
});
