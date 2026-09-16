import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { getTheme, setTheme } from "../tokens";
import { YoThemeToggle } from "./ThemeToggle";

describe("YoThemeToggle", () => {
  beforeEach(() => {
    setTheme("light");
  });

  afterEach(() => {
    setTheme("light");
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-pref");
  });

  it("浅色时显示太阳并提示切到深色", () => {
    const { container } = render(() => <YoThemeToggle />);
    const btn = screen.getByRole("button", { name: "切换到深色模式" });
    expect(btn).toBeTruthy();
    expect(btn.className).toContain("yohu-icon-button");
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.getAttribute("data-pressed")).toBeNull();
    expect(container.querySelector('svg[data-icon="display-on"]')).toBeTruthy();
    expect(container.querySelector('svg[data-icon="display-off"]')).toBeTruthy();
  });

  it("点击后切到深色并回调", async () => {
    const onThemeChange = vi.fn();
    render(() => <YoThemeToggle onThemeChange={onThemeChange} />);
    fireEvent.click(screen.getByRole("button", { name: "切换到深色模式" }));
    await waitFor(() => {
      expect(getTheme()).toBe("dark");
      expect(onThemeChange).toHaveBeenCalledWith("dark");
    });
    expect(screen.getByRole("button", { name: "切换到浅色模式" })).toBeTruthy();
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });
});
