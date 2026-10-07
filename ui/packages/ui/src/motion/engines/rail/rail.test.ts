import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Layout } from "../../../tokens/layout";
import {
  railIntentIsExpanded,
  railPhaseAfterWidthSettle,
  railPhaseOnIntentChange,
  railToggleIntent,
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

  it("展开意图只在 railIntentIsExpanded 里比较", () => {
    expect(railIntentIsExpanded("expanded")).toBe(true);
    expect(railIntentIsExpanded("icons")).toBe(false);
    expect(railToggleIntent("expanded")).toBe("icons");
    expect(railToggleIntent("icons")).toBe("expanded");
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      resolve(here, "rail-model.ts"),
      resolve(here, "rail.tsx"),
      resolve(here, "../../../../../workbench/src/shell/AppLayout.tsx"),
    ];
    for (const path of files) {
      const text = readFileSync(path, "utf8");
      const body = path.endsWith("rail-model.ts") ? text.replace('return intent === "expanded"', "") : text;
      expect(body, path).not.toContain('intent === "expanded"');
      expect(body, path).not.toContain('next === "expanded"');
      expect(body, path).not.toContain('current === "expanded"');
      expect(body, path).not.toContain('intent() === "expanded"');
      expect(body, path).not.toContain('railIntent() === "expanded"');
    }
  });

  it("宽度拍与休息相位一致", () => {
    expect(railWidthIntent("collapsing")).toBe("icons");
    expect(railWidthIntent("expanding")).toBe("expanded");
    expect(railWidthMatchesIntent(Layout.ShellNavIcons, true)).toBe(false);
    expect(railWidthMatchesIntent(Layout.ShellNav, true)).toBe(true);
    expect(railWidthMatchesIntent(Layout.ShellNavIcons, false)).toBe(true);
  });
});

describe("轨宽取整", () => {
  it("实测与期望都先取整再比较", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const text = readFileSync(resolve(here, "rail-model.ts"), "utf8");
    expect(text.split("Math.round(" + "usedPx)").length - 1).toBe(0);
    expect(text.split("Math.round(" + "expected)").length - 1).toBe(0);
    expect(text).toContain("railPx(usedPx)");
    expect(text).toContain("railPx(expected)");
    expect(text.split("function railPx").length - 1).toBe(1);
    expect(text.split("return Math.round(value)").length - 1).toBe(1);
    expect(text).toContain("Layout.ShellNavIcons");
  });
});
