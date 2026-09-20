import { describe, expect, it } from "vitest";
import { chromeHostAttrs, resolveChromeSlots } from "./chrome-policy";

describe("chrome-policy", () => {
  it("宿主只写投放，不写 data-layout", () => {
    expect(chromeHostAttrs({})).toEqual({
      "data-drop": undefined,
    });
    expect(chromeHostAttrs({})).not.toHaveProperty("data-layout");
    expect(resolveChromeSlots({})).toEqual({
      showLeading: false,
      showBar: false,
      showExtra: false,
    });
  });

  it("功能栏与次行分别开槽，leading 走同一快照", () => {
    const input = { hasBar: true, hasExtra: true, hasLeading: true };
    expect(chromeHostAttrs(input)).not.toHaveProperty("data-layout");
    expect(resolveChromeSlots(input)).toEqual({
      showLeading: true,
      showBar: true,
      showExtra: true,
    });
    expect(resolveChromeSlots({ hasLeading: true }).showLeading).toBe(true);
    expect(resolveChromeSlots({}).showLeading).toBe(false);
  });

  it("dropIgnore 写成 data-drop=ignore", () => {
    expect(chromeHostAttrs({ dropIgnore: true })["data-drop"]).toBe("ignore");
  });
});
