import { describe, expect, it } from "vitest";

import { Spacing } from "../tokens/spacing";
import { placeTooltip, readTooltipTrigger } from "./tooltip-place";

const VIEW = { width: 800, height: 600 };
const TRIGGER = { top: 200, left: 200, bottom: 232, width: 40, height: 32 };

describe("tooltip-place", () => {
  it("无锚点时测量为零盒", () => {
    expect(readTooltipTrigger(undefined)).toEqual({
      top: 0,
      left: 0,
      bottom: 0,
      width: 0,
      height: 0,
    });
  });

  it("prefer=top 且上方够用时向上；宽 hug 内容并水平居中", () => {
    const box = placeTooltip(TRIGGER, { width: 80, height: 24 }, VIEW);
    expect(box.placement).toBe("top");
    expect(box.top).toBeNull();
    expect(box.bottom).toBe(VIEW.height - TRIGGER.top + Spacing.Xs);
    expect(box.minWidth).toBe(80);
    expect(box.left).toBe(TRIGGER.left + TRIGGER.width / 2 - 40);
  });

  it("不把宽度锁成锚点宽", () => {
    const box = placeTooltip(TRIGGER, { width: 120, height: 24 }, VIEW);
    expect(box.minWidth).toBe(120);
    expect(box.minWidth).not.toBe(TRIGGER.width);
  });
});
