import { describe, expect, it } from "vitest";

import {
  railBlockHidden,
  railCopyOpaque,
  railPhaseOnIntentChange,
  railSlotOpen,
  railStreamOpen,
  railWidthMatchesIntent,
} from "./rail";

describe("rail 公开时序（转发 YoRail）", () => {
  it("收起当拍关流，展开行程开流，铬按图标列收", () => {
    expect(railPhaseOnIntentChange("expanded", false)).toBe("expanding");
    expect(railStreamOpen("expanding")).toBe(true);
    expect(railCopyOpaque("expanding")).toBe(true);
    expect(railSlotOpen("expanding")).toBe(true);
    expect(railBlockHidden("expanding")).toBe(true);
    expect(railStreamOpen("collapsing")).toBe(false);
    expect(railSlotOpen("collapsing")).toBe(false);
  });

  it("宽度未落到意图 token 不算落地", () => {
    expect(railWidthMatchesIntent(48, true, "232px", "48px")).toBe(false);
    expect(railWidthMatchesIntent(232, true, "232px", "48px")).toBe(true);
  });
});
