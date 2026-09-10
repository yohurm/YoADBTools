import { describe, expect, it } from "vitest";
import { resolveChromeLayout, resolveChromeSpec } from "./chrome-model";

describe("chrome-model", () => {
  it("无栏无次行是 title", () => {
    expect(resolveChromeLayout({})).toBe("title");
    expect(resolveChromeSpec({})).toEqual({
      layout: "title",
      showDevice: false,
      drop: undefined,
    });
  });

  it("功能栏 / 次行组合成四种布局", () => {
    expect(resolveChromeLayout({ hasBar: true })).toBe("title-bar");
    expect(resolveChromeLayout({ hasExtra: true })).toBe("title-extra");
    expect(resolveChromeLayout({ hasBar: true, hasExtra: true })).toBe("title-bar-extra");
  });

  it("deviceLabel 与 dropIgnore 进规格", () => {
    expect(resolveChromeSpec({ deviceLabel: "Moto X", dropIgnore: true })).toEqual({
      layout: "title",
      showDevice: true,
      drop: "ignore",
    });
  });
});
