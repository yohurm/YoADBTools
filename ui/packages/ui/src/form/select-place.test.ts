import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { Layout } from "../tokens/layout";
import { Spacing } from "../tokens/spacing";
import { controlRowHeight } from "../tokens";
import { estimateMenuHeight } from "../overlay/popover-place";
import {
  SELECT_MENU_VIEWPORT_RATIO,
  layoutSelectMenu,
  selectMenuContentWidth,
  selectMenuWidth,
} from "./select-place";

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
  it("下方够用时向下；高取实测与行估算的较大值；只返回盒", () => {
    const layer = document.createElement("div");
    const scrollHeight = 40;
    const estimated = estimateMenuHeight(3, TRIGGER.height, Spacing.Sm * 2);
    const laid = layoutSelectMenu(TRIGGER, { optionCount: 3, scrollHeight }, VIEW);
    expect(estimated).toBeGreaterThan(scrollHeight);
    expect(laid.placement).toBe("bottom");
    expect(laid.overflowY).toBe(false);
    expect(laid.style.top).toBe(`${TRIGGER.bottom + Spacing.Sm}px`);
    expect(laid.style.width).toBe(`${TRIGGER.width}px`);
    expect(laid.style.minWidth).toBe(laid.style.width);
    expect(laid.style.maxHeight).toBe(`${estimated}px`);
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

  it("短文案宽等于触发钮；长文案撑开；视口与菜单帽收口", () => {
    const laid = layoutSelectMenu(TRIGGER, { optionCount: 1, scrollHeight: 32 }, VIEW);
    expect(laid.style.width).toBe(`${TRIGGER.width}px`);
    expect(laid.style.minWidth).toBe(laid.style.width);
    const wide = layoutSelectMenu(
      { ...TRIGGER, width: 360 },
      { optionCount: 1, scrollHeight: 32 },
      VIEW,
    );
    expect(wide.style.width).toBe("360px");
    const narrow = layoutSelectMenu(TRIGGER, { optionCount: 1, scrollHeight: 32 }, {
      width: 100,
      height: 600,
    });
    expect(narrow.style.width).toBe("100px");
    expect(selectMenuWidth(80, 0, 800)).toBe(80);
    expect(selectMenuWidth(360, 0, 0)).toBe(360);
    const labels = ["跟随系统", "浅色", "深色"];
    const content = selectMenuContentWidth(labels);
    const grown = layoutSelectMenu(
      { ...TRIGGER, width: 80 },
      { optionCount: labels.length, scrollHeight: 96, labels },
      VIEW,
    );
    expect(content).toBeGreaterThan(80);
    expect(grown.style.width).toBe(`${content}px`);
    expect(selectMenuWidth(80, 480, 800)).toBe(Layout.MenuMax);
    expect(selectMenuWidth(420, 480, 800)).toBe(420);
  });

  it("菜单高度 hug 内容，超过视口 80% 才裁切", () => {
    const tall = layoutSelectMenu(TRIGGER, { optionCount: 40, scrollHeight: 2000 }, VIEW);
    const cap = VIEW.height * SELECT_MENU_VIEWPORT_RATIO;
    expect(tall.overflowY).toBe(true);
    expect(tall.style.maxHeight).toBe(`${cap}px`);
  });

  it("触发钮没有高度时行高跟 controlRowHeight", () => {
    document.documentElement.setAttribute("data-density", "compact");
    try {
      const trigger = { ...TRIGGER, height: 0 };
      const estimated = estimateMenuHeight(2, controlRowHeight(), Spacing.Sm * 2);
      const laid = layoutSelectMenu(trigger, { optionCount: 2, scrollHeight: 0 }, VIEW);
      expect(controlRowHeight()).toBe(26);
      expect(laid.style.maxHeight).toBe(`${estimated}px`);
      const src = loadPlaceSrc();
      expect(src).not.toContain("readCssPx");
      expect(src).not.toContain("--yohu-control-height");
    } finally {
      document.documentElement.removeAttribute("data-density");
    }
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
