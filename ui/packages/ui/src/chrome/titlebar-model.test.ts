import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  captionPaint,
  resolveTitleBarBrand,
  resolveTitleBarSpec,
  titleBarBrandIsIcon,
  titleBarBrandIsLogo,
  titleBarCaptionIsClose,
  titleBarCaptionIsMax,
  titleBarCaptionIsMin,
  titleBarMaxIsRestore,
} from "./titlebar-model";

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

  it("品牌、三键和还原只各比一次", () => {
    expect(titleBarBrandIsLogo("logo")).toBe(true);
    expect(titleBarBrandIsLogo("icon")).toBe(false);
    expect(titleBarBrandIsIcon("icon")).toBe(true);
    expect(titleBarBrandIsIcon("logo")).toBe(false);
    expect(titleBarCaptionIsMin("min")).toBe(true);
    expect(titleBarCaptionIsMax("max")).toBe(true);
    expect(titleBarCaptionIsClose("close")).toBe(true);
    expect(titleBarCaptionIsClose("min")).toBe(false);
    expect(titleBarMaxIsRestore("restore")).toBe(true);
    expect(titleBarMaxIsRestore("maximize")).toBe(false);
    const here = dirname(fileURLToPath(import.meta.url));
    for (const name of ["titlebar-model.ts", "titlebar-policy.ts", "TitleBar.tsx"]) {
      let body = readFileSync(join(here, name), "utf8");
      if (name === "titlebar-model.ts") {
        body = body
          .replace('return brand === "logo"', "")
          .replace('return brand === "icon"', "")
          .replace('return kind === "min"', "")
          .replace('return kind === "max"', "")
          .replace('return kind === "close"', "")
          .replace('return action === "restore"', "");
      }
      expect(body, name).not.toContain('=== "logo"');
      expect(body, name).not.toContain('=== "icon"');
      expect(body, name).not.toContain('=== "min"');
      expect(body, name).not.toContain('=== "max"');
      expect(body, name).not.toContain('=== "close"');
      expect(body, name).not.toContain('=== "restore"');
    }
  });
});
