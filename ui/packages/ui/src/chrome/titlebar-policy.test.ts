import { describe, expect, it } from "vitest";
import { isCaptionTarget, resolveTitleBarSlots, titlebarHostAttrs } from "./titlebar-policy";

describe("titlebar-policy", () => {
  it("宿主 data-captions / data-brand", () => {
    expect(titlebarHostAttrs({})).toEqual({
      "data-captions": "trailing",
      "data-brand": "none",
    });
    expect(titlebarHostAttrs({ logoSrc: "/app-icon.png", nativeCaptions: true })).toEqual({
      "data-captions": "native",
      "data-brand": "logo",
    });
  });

  it("槽位从 Input 一次给出品牌、三键与是否画 captions", () => {
    const slots = resolveTitleBarSlots({});
    expect(slots.brand).toBe("none");
    expect(slots.showCaptions).toBe(true);
    expect(slots.captions.map((b) => [b.kind, b.label, b.paint, b.icon])).toEqual([
      ["min", "最小化", "window", "window-min"],
      ["max", "最大化", "window", "window-max"],
      ["close", "关闭", "close", "close"],
    ]);
    expect(resolveTitleBarSlots({ nativeCaptions: true }).showCaptions).toBe(false);
    expect(resolveTitleBarSlots({ logoSrc: "/app-icon.png" }).brand).toBe("logo");
  });

  it("最大化时中间键变为还原", () => {
    const max = resolveTitleBarSlots({ maximized: true }).captions[1];
    expect(max.label).toBe("还原");
    expect(max.icon).toBe("window-restore");
    expect(max.paint).toBe("window");
  });

  it("点在按钮上算 caption 命中", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    expect(isCaptionTarget(button)).toBe(true);
    expect(isCaptionTarget(document.createElement("span"))).toBe(false);
    button.remove();
  });
});
