import { describe, expect, it } from "vitest";

import {
  railPhaseAfterWidthSettle,
  railPhaseOnIntentChange,
  railSlotOpen,
  railStreamAttr,
  railStreamOpen,
  railTooltipEnabled,
  railTraveling,
  railWidthIntent,
  railWidthMatchesIntent,
} from "./rail-model";

describe("YoRail 时序", () => {
  it("减动效当拍落到意图", () => {
    expect(railPhaseOnIntentChange("icons", true)).toBe("icons");
    expect(railPhaseOnIntentChange("expanded", true)).toBe("expanded");
  });

  it("有行程时先走 collapsing / expanding", () => {
    expect(railPhaseOnIntentChange("icons", false)).toBe("collapsing");
    expect(railPhaseOnIntentChange("expanded", false)).toBe("expanding");
  });

  it("宽度落地后落到休息相位", () => {
    expect(railPhaseAfterWidthSettle("expanded")).toBe("expanded");
    expect(railPhaseAfterWidthSettle("icons")).toBe("icons");
  });

  it("文案流四相位：展开与展开行程开，收起当拍关", () => {
    expect(railStreamOpen("expanded")).toBe(true);
    expect(railStreamOpen("expanding")).toBe(true);
    expect(railStreamOpen("collapsing")).toBe(false);
    expect(railStreamOpen("icons")).toBe(false);
    expect(railStreamAttr("expanded")).toBe("open");
    expect(railStreamAttr("expanding")).toBe("open");
    expect(railStreamAttr("collapsing")).toBe("closed");
    expect(railStreamAttr("icons")).toBe("closed");
    for (const phase of ["expanded", "expanding"] as const) {
      expect(railSlotOpen(phase)).toBe(true);
    }
    for (const phase of ["collapsing", "icons"] as const) {
      expect(railSlotOpen(phase)).toBe(false);
    }
  });

  it("列宽插值中滚轴不算溢出", () => {
    expect(railTraveling("expanding")).toBe(true);
    expect(railTraveling("collapsing")).toBe(true);
    expect(railTraveling("expanded")).toBe(false);
    expect(railTraveling("icons")).toBe(false);
  });

  it("气泡跟关流同一拍", () => {
    expect(railTooltipEnabled("icons")).toBe(true);
    expect(railTooltipEnabled("collapsing")).toBe(true);
    expect(railTooltipEnabled("expanding")).toBe(false);
    expect(railTooltipEnabled("expanded")).toBe(false);
  });

  it("宽度拍与休息相位一致", () => {
    expect(railWidthIntent("collapsing")).toBe("icons");
    expect(railWidthIntent("expanding")).toBe("expanded");
    expect(railWidthMatchesIntent(48, true, "232px", "48px")).toBe(false);
    expect(railWidthMatchesIntent(232, true, "232px", "48px")).toBe(true);
    expect(railWidthMatchesIntent(48, false, "232px", "48px")).toBe(true);
  });
});
