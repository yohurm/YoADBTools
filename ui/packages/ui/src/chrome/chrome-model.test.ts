import { describe, expect, it } from "vitest";
import { chromeHasBar, resolveChromeSpec } from "./chrome-model";

describe("chrome-model", () => {
  it("缺省无 leading、无栏、无次行、无 drop", () => {
    expect(resolveChromeSpec({})).toEqual({
      showLeading: false,
      showBar: false,
      showExtra: false,
      drop: undefined,
    });
  });

  it("hasLeading 与 dropIgnore 进规格", () => {
    expect(resolveChromeSpec({ hasLeading: true, dropIgnore: true })).toEqual({
      showLeading: true,
      showBar: false,
      showExtra: false,
      drop: "ignore",
    });
  });

  it("hasBar / hasExtra 进规格，没有 layout", () => {
    expect(resolveChromeSpec({ hasBar: true, hasExtra: true })).toEqual({
      showLeading: false,
      showBar: true,
      showExtra: true,
      drop: undefined,
    });
    expect(resolveChromeSpec({ hasBar: true, hasExtra: true })).not.toHaveProperty("layout");
  });

  it("功能栏只认有 key 的项", () => {
    expect(chromeHasBar(undefined)).toBe(false);
    expect(chromeHasBar([])).toBe(false);
    expect(chromeHasBar([{ key: "clear" }])).toBe(true);
  });
});
