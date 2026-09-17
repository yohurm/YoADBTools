import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { Spacing } from "../tokens/spacing";
import { estimateMenuHeight } from "../overlay/popover-place";
import { layoutSelectMenu, readSelectTrigger } from "./select-place";

const VIEW = { width: 800, height: 600 };
const TRIGGER = { top: 40, left: 100, bottom: 72, width: 120, height: 32 };

function loadPlaceSrc(): string {
  const candidates = [
    resolve(process.cwd(), "src/form/select-place.ts"),
    resolve(process.cwd(), "packages/ui/src/form/select-place.ts"),
  ];
  return candidates.map((p) => (existsSync(p) ? readFileSync(p, "utf-8") : "")).find(Boolean) ?? "";
}

describe("select-place", () => {
  it("无锚点时测量为零盒", () => {
    expect(readSelectTrigger(undefined)).toEqual({
      top: 0,
      left: 0,
      bottom: 0,
      width: 0,
      height: 0,
    });
  });

  it("下方够用时向下；高取实测与行估算的较大值；只返回盒", () => {
    const layer = document.createElement("div");
    const scrollHeight = 40;
    const estimated = estimateMenuHeight(3, TRIGGER.height, Spacing.Xs * 2);
    const laid = layoutSelectMenu(TRIGGER, { optionCount: 3, scrollHeight }, VIEW);
    expect(estimated).toBeGreaterThan(scrollHeight);
    expect(laid.placement).toBe("bottom");
    expect(laid.overflowY).toBe(false);
    expect(laid.style.top).toBe(`${TRIGGER.bottom + Spacing.Sm}px`);
    expect(laid.style.minWidth).toBe(`${TRIGGER.width}px`);
    expect(laid.style.maxHeight).toBe(`${estimated}px`);
    expect(laid.style.width).toBeUndefined();
    expect(layer.attributes.length).toBe(0);
    expect(layer.getAttribute("data-placed")).toBeNull();
    expect(layer.getAttribute("data-placement")).toBeNull();
    expect(layer.getAttribute("data-overflow-y")).toBeNull();
    expect(layer.style.cssText).toBe("");
  });

  it("贴视口底时向上，不往下撑", () => {
    const layer = document.createElement("div");
    const trigger = { top: 560, left: 100, bottom: 592, width: 120, height: 32 };
    const laid = layoutSelectMenu(trigger, { optionCount: 3, scrollHeight: 104 }, VIEW);
    expect(laid.placement).toBe("top");
    expect(laid.style.top).toBe("auto");
    expect(Number.parseFloat(laid.style.bottom ?? "")).toBeGreaterThan(0);
    expect(layer.getAttribute("data-placement")).toBeNull();
    expect(layer.getAttribute("data-placed")).toBeNull();
  });

  it("不把宽度锁成内容宽以外的魔法数；minWidth 跟触发钮", () => {
    const laid = layoutSelectMenu(TRIGGER, { optionCount: 1, scrollHeight: 32 }, VIEW);
    expect(laid.style.minWidth).toBe(`${TRIGGER.width}px`);
    expect(laid.style.minWidth).not.toBe("0px");
    expect(laid.style.width).toBeUndefined();
  });

  it("L3 不写 layer attribute，也不调 applyPopoverBox", () => {
    const src = loadPlaceSrc();
    expect(src.length).toBeGreaterThan(0);
    expect(src).not.toMatch(/\bapplyPopoverBox\b/);
    expect(src).not.toMatch(/dataset/);
    expect(src).not.toMatch(/setAttribute/);
    expect(src).not.toMatch(/\.style\./);
  });
});
