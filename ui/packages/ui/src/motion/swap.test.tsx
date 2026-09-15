import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { YoSwap } from "./swap";

function loadSwapSrc(): string {
  const candidates = [
    resolve(process.cwd(), "src/motion/swap.tsx"),
    resolve(process.cwd(), "packages/ui/src/motion/swap.tsx"),
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
    setLabel("收起预览");
    expect(screen.getByText("收起预览")).toBeTruthy();
    expect(screen.queryByText("预览")).toBeNull();
    expect(document.querySelector(".yohu-swap")?.getAttribute("data-resizing")).toBeNull();
  });

  it("先换目标文案再插槽宽，禁止收到尽头再换字", () => {
    const src = loadSwapSrc();
    expect(src).toContain("先换目标文案");
    expect(src).toContain("inner?.getBoundingClientRect()");
    expect(src).not.toContain("measureWidth");
    expect(src).not.toContain("pending");
    expect(src).not.toContain("shrinking");
    expect(src).not.toContain("收完再换");
  });
});
