import { describe, expect, it } from "vitest";
import { chromeHostAttrs, resolveChromeSlots } from "./chrome-policy";

describe("chrome-policy", () => {
  it("无操作页仍是 title 布局", () => {
    expect(chromeHostAttrs({})).toEqual({
      "data-layout": "title",
      "data-drop": undefined,
    });
    expect(resolveChromeSlots({})).toEqual({
      showDevice: false,
      showBar: false,
      showExtra: false,
    });
  });

  it("功能栏与次行分别开槽", () => {
    const input = { hasBar: true, hasExtra: true, deviceLabel: "A1" };
    expect(chromeHostAttrs(input)["data-layout"]).toBe("title-bar-extra");
    expect(resolveChromeSlots(input)).toEqual({
      showDevice: true,
      showBar: true,
      showExtra: true,
    });
  });

  it("dropIgnore 写成 data-drop=ignore", () => {
    expect(chromeHostAttrs({ dropIgnore: true })["data-drop"]).toBe("ignore");
  });
});
