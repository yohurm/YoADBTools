import { describe, expect, it } from "vitest";
import { captionPaint, resolveTitleBarBrand, resolveTitleBarSpec } from "./titlebar-model";

describe("titlebar-model", () => {
  it("缺省是自绘三键 + 无品牌", () => {
    expect(resolveTitleBarSpec({})).toEqual({
      captions: "trailing",
      brand: "none",
      maxAction: "maximize",
      showCaptions: true,
    });
  });

  it("logoSrc 优先于字形 icon", () => {
    expect(resolveTitleBarBrand({ logoSrc: "/app-icon.png", icon: "terminal" })).toBe("logo");
    expect(resolveTitleBarBrand({ icon: "terminal" })).toBe("icon");
  });

  it("nativeCaptions 隐藏自绘三键", () => {
    expect(resolveTitleBarSpec({ nativeCaptions: true }).showCaptions).toBe(false);
    expect(resolveTitleBarSpec({ nativeCaptions: true }).captions).toBe("native");
  });

  it("最大化切还原", () => {
    expect(resolveTitleBarSpec({ maximized: true }).maxAction).toBe("restore");
  });

  it("关闭键才走 close 涂装", () => {
    expect(captionPaint("min")).toBe("window");
    expect(captionPaint("max")).toBe("window");
    expect(captionPaint("close")).toBe("close");
  });
});
