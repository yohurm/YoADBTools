import { describe, expect, it } from "vitest";
import { resolveChromeLayout, resolveChromeSpec } from "./chrome-model";

describe("chrome-model", () => {
  it("无栏无次行是 title", () => {
    expect(resolveChromeLayout({})).toBe("title");
    expect(resolveChromeSpec({})).toEqual({
      layout: "title",
      showLeading: false,
      drop: undefined,
    });
  });

  it("功能栏 / 次行组合成四种布局", () => {
    expect(resolveChromeLayout({ hasBar: true })).toBe("title-bar");
    expect(resolveChromeLayout({ hasExtra: true })).toBe("title-extra");
    expect(resolveChromeLayout({ hasBar: true, hasExtra: true })).toBe("title-bar-extra");
  });

  it("hasLeading 与 dropIgnore 进规格", () => {
    expect(resolveChromeSpec({ hasLeading: true, dropIgnore: true })).toEqual({
      layout: "title",
      showLeading: true,
      drop: "ignore",
    });
  });
});
