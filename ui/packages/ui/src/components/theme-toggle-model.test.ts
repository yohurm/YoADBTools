import { describe, expect, it } from "vitest";
import { THEME_TOGGLE_MOON, THEME_TOGGLE_SUN, themeToggleDark, themeToggleTitle } from "./theme-toggle-model";

describe("theme-toggle-model", () => {
  it("浅色提示切到深色，深色提示切到浅色", () => {
    expect(themeToggleTitle("light")).toBe("切换到深色模式");
    expect(themeToggleTitle("dark")).toBe("切换到浅色模式");
  });

  it("只有 dark 算按下语义", () => {
    expect(themeToggleDark("dark")).toBe(true);
    expect(themeToggleDark("light")).toBe(false);
  });

  it("太阳/月亮字形名与鸿蒙符号对齐", () => {
    expect(THEME_TOGGLE_SUN).toBe("display-on");
    expect(THEME_TOGGLE_MOON).toBe("display-off");
  });
});
