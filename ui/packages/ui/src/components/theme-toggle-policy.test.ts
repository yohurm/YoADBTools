import { describe, expect, it } from "vitest";
import { resolveThemeToggleInteractive, themeToggleHostAttrs } from "./theme-toggle-policy";

describe("theme-toggle-policy", () => {
  it("空闲可点", () => {
    expect(resolveThemeToggleInteractive({})).toEqual({ disabled: false, busy: false });
  });

  it("busy 关掉输入", () => {
    expect(resolveThemeToggleInteractive({ busy: true })).toEqual({ disabled: true, busy: true });
  });

  it("浅色宿主不带按下铬语义，只报 aria-pressed=false", () => {
    expect(themeToggleHostAttrs("light")).toEqual({
      title: "切换到深色模式",
      disabled: false,
      "aria-pressed": false,
    });
  });

  it("深色 + busy 禁用并报已按下", () => {
    expect(themeToggleHostAttrs("dark", true)).toEqual({
      title: "切换到浅色模式",
      disabled: true,
      "aria-pressed": true,
    });
  });
});
