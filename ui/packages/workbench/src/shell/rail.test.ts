import { describe, expect, it } from "vitest";

import { Layout } from "@yohu/ui";

import {
  railPhaseOnIntentChange,
  railSlotOpen,
  railStreamOpen,
  railWidthMatchesIntent,
} from "./rail";

describe("rail 公开时序（转发 YoRail）", () => {
  it("文案流四相位：展开与展开行程开，收起当拍关", () => {
    expect(railStreamOpen("expanded")).toBe(true);
    expect(railStreamOpen("expanding")).toBe(true);
    expect(railStreamOpen("collapsing")).toBe(false);
    expect(railStreamOpen("icons")).toBe(false);
  });

  it("点开合先走行程相位；槽跟文案流", () => {
    expect(railPhaseOnIntentChange("expanded", false)).toBe("expanding");
    expect(railSlotOpen("expanding")).toBe(true);
    expect(railSlotOpen("collapsing")).toBe(false);
  });

  it("宽度未落到意图 token 不算落地", () => {
    const expanded = `${Layout.ShellNav}px`;
    const icons = `${Layout.ShellNavIcons}px`;
    expect(railWidthMatchesIntent(Layout.ShellNavIcons, true, expanded, icons)).toBe(false);
    expect(railWidthMatchesIntent(Layout.ShellNav, true, expanded, icons)).toBe(true);
  });
});
