import { describe, expect, it } from "vitest";

import { Spacing } from "../tokens/spacing";
import { estimateMenuHeight } from "./popover-place";
import { layoutSelectMenu, readSelectTrigger } from "./select-place";

const VIEW = { width: 800, height: 600 };
const TRIGGER = { top: 40, left: 100, bottom: 72, width: 120, height: 32 };

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

  it("下方够用时向下；高取实测与行估算的较大值；写入 layer", () => {
    const layer = document.createElement("div");
    const scrollHeight = 40;
    const estimated = estimateMenuHeight(3, TRIGGER.height, Spacing.Xs * 2);
    const laid = layoutSelectMenu(TRIGGER, { optionCount: 3, scrollHeight }, layer, VIEW);
    expect(estimated).toBeGreaterThan(scrollHeight);
    expect(laid.placement).toBe("bottom");
    expect(laid.overflowY).toBe(false);
    expect(laid.style.top).toBe(`${TRIGGER.bottom + Spacing.Sm}px`);
    expect(laid.style.minWidth).toBe(`${TRIGGER.width}px`);
    expect(laid.style.maxHeight).toBe(`${estimated}px`);
    expect(laid.style.width).toBeUndefined();
    expect(layer.dataset.placed).toBe("true");
    expect(layer.dataset.placement).toBe("bottom");
  });

  it("贴视口底时向上，不往下撑", () => {
    const layer = document.createElement("div");
    const trigger = { top: 560, left: 100, bottom: 592, width: 120, height: 32 };
    const laid = layoutSelectMenu(trigger, { optionCount: 3, scrollHeight: 104 }, layer, VIEW);
    expect(laid.placement).toBe("top");
    expect(laid.style.top).toBe("auto");
    expect(Number.parseFloat(laid.style.bottom ?? "")).toBeGreaterThan(0);
    expect(layer.dataset.placement).toBe("top");
  });

  it("不把宽度锁成内容宽以外的魔法数；minWidth 跟触发钮", () => {
    const layer = document.createElement("div");
    const laid = layoutSelectMenu(TRIGGER, { optionCount: 1, scrollHeight: 32 }, layer, VIEW);
    expect(laid.style.minWidth).toBe(`${TRIGGER.width}px`);
    expect(laid.style.minWidth).not.toBe("0px");
    expect(layer.style.width).toBe("");
  });
});
