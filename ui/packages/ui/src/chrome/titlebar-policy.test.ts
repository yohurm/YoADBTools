import { describe, expect, it } from "vitest";
import { resolveTitleBarSpec } from "./titlebar-model";
import { isCaptionTarget, titlebarCaptionButtons, titlebarHostAttrs } from "./titlebar-policy";

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

  it("三键顺序为最小化、最大化、关闭", () => {
    const buttons = titlebarCaptionButtons(resolveTitleBarSpec({}));
    expect(buttons.map((b) => [b.kind, b.label, b.paint, b.icon])).toEqual([
      ["min", "最小化", "window", "window-min"],
      ["max", "最大化", "window", "window-max"],
      ["close", "关闭", "close", "close"],
    ]);
  });

  it("最大化时中间键变为还原", () => {
    const max = titlebarCaptionButtons(resolveTitleBarSpec({ maximized: true }))[1];
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
