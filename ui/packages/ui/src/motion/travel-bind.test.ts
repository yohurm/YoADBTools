import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

describe("YoTravel binder", () => {
  it("当拍写 used，无 hold / rAF / 观察器 / Dialog 选择器", () => {
    const src = [
      load("src/motion/travel-bind.ts"),
      load("src/motion/travel.tsx"),
      load("src/motion/travel-model.ts"),
      load("src/motion/travel-policy.ts"),
    ].join("\n");
    expect(src).toContain("measureTravelUsed");
    expect(src).toContain('el.style.transition = "none"');
    expect(src).toContain("offsetHeight");
    expect(src).toContain("offsetWidth");
    expect(src).toContain('travel: "used"');
    expect(src).toContain("data-ready");
    expect(src).toContain("YoTravel");
    expect(src).toContain("ctl.command()");
    expect(src).toContain("onTraveling");
    expect(src).toContain("traveling");
    expect(src).toContain("notifyTrip(true)");
    expect(src).not.toContain('"hold"');
    expect(src).not.toMatch(/data-travel["\s=]+hold/);
    expect(src).not.toContain("requestAnimationFrame");
    expect(src).not.toContain("MutationObserver");
    expect(src).not.toContain("ResizeObserver");
    expect(src).not.toMatch(/\.getBoundingClientRect\s*\(/);
    expect(src).not.toContain("yohu-dialog");
    expect(src).not.toContain("yohu-reveal");
    expect(src).not.toContain("DialogBodyMax");
  });
});

describe("YoReveal → Travel", () => {
  it("先 snapshot 旧盒，再写布局轴，再 command", () => {
    const src = load("src/motion/reveal.tsx");
    const effect = src.slice(src.indexOf("createRenderEffect(()"));
    const snap = effect.indexOf("travel?.snapshot()");
    const write = effect.indexOf("paintLayout");
    const command = effect.indexOf("travel?.command()");
    expect(src).toContain('root.setAttribute("data-layout"');
    expect(src).toContain("--yohu-reveal-span");
    expect(snap).toBeGreaterThan(0);
    expect(write).toBeGreaterThan(snap);
    expect(command).toBeGreaterThan(write);
    expect(src).not.toContain("data-layout={host()");
  });
});
