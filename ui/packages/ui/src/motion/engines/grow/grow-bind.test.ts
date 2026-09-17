import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { measureGrowUsed, readGrowLock } from "./grow-bind";

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

describe("YoGrow binder", () => {
  it("当拍写 height，无 hold / rAF / 观察器 / Travel 双轨", () => {
    const src = [
      load("src/motion/engines/grow/grow-bind.ts"),
      load("src/motion/engines/grow/grow.tsx"),
      load("src/motion/engines/grow/grow-model.ts"),
      load("src/motion/engines/grow/grow-policy.ts"),
    ].join("\n");
    expect(src).toContain("measureGrowUsed");
    expect(src).toContain("el.animate");
    expect(src).toContain("fill: \"forwards\"");
    expect(src).toContain("writeHeight");
    expect(src).toContain("data-ready");
    expect(src).toContain("YoGrow");
    expect(src).toContain("yohu-grow__slot");
    expect(src).toContain("ctl.command()");
    expect(src).toContain("onTraveling");
    expect(src).toContain("tripTo");
    expect(src).toContain("readGrowLock");
    expect(src).toContain("tripId");
    expect(src).toContain("document.timeline");
    expect(src).toContain("GROW_USED_ATTR");
    expect(src).not.toContain("dirty");
    expect(src).not.toContain("frozen");
    expect(src).not.toContain('"hold"');
    expect(src).not.toContain("requestAnimationFrame");
    expect(src).not.toContain("MutationObserver");
    expect(src).not.toContain("ResizeObserver");
    expect(src).not.toMatch(/\.getBoundingClientRect\s*\(/);
    expect(src).not.toContain("yohu-dialog");
    expect(src).not.toContain("yohu-text-field");
    expect(src).toContain("style.height");
    expect(src).not.toContain("minHeight");
    expect(src).not.toContain("maxHeight");
    expect(src).not.toContain("fit");
    expect(src).not.toContain("hug");
    expect(src).not.toContain("降程");
    expect(src).not.toContain("getPropertyValue");
  });
});

describe("measureGrowUsed", () => {
  it("量子盒，不解宿主高", () => {
    const host = document.createElement("div");
    const slot = document.createElement("div");
    const child = document.createElement("div");
    host.append(slot);
    slot.append(child);
    host.style.height = "32px";
    Object.defineProperty(host, "offsetHeight", { configurable: true, value: 32 });
    Object.defineProperty(child, "offsetHeight", { configurable: true, value: 96 });
    expect(measureGrowUsed(host)).toBe(96);
    expect(host.style.height).toBe("32px");
  });

  it("有标记盒时量标记，不量铺满锁行的第一子盒", () => {
    const host = document.createElement("div");
    const slot = document.createElement("div");
    const chrome = document.createElement("div");
    const used = document.createElement("div");
    used.setAttribute("data-grow-used", "");
    host.append(slot);
    slot.append(chrome, used);
    Object.defineProperty(chrome, "offsetHeight", { configurable: true, value: 32 });
    Object.defineProperty(used, "offsetHeight", { configurable: true, value: 96 });
    expect(measureGrowUsed(host)).toBe(96);
  });

  it("锁行读宿主当前高，不是子盒", () => {
    const host = document.createElement("div");
    Object.defineProperty(host, "offsetHeight", { configurable: true, value: 80 });
    expect(readGrowLock(host)).toBe(80);
  });
});
