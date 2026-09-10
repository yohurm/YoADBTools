import { afterEach, describe, expect, it } from "vitest";
import { getTheme, setTheme } from "../tokens";
import {
  nextResolvedTheme,
  runThemeViewTransition,
  themeTransitionOriginFromElement,
  themeWipeFrames,
  themeWipeRadius,
  THEME_WIPE_COVERAGE,
} from "./theme-transition";

describe("theme-transition", () => {
  afterEach(() => {
    setTheme("light");
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-pref");
    document.documentElement.removeAttribute("data-theme-transition");
  });

  it("nextResolvedTheme 在深浅之间对调", () => {
    expect(nextResolvedTheme("light")).toBe("dark");
    expect(nextResolvedTheme("dark")).toBe("light");
  });

  it("themeWipeRadius 取最远角斜边并加覆盖余量", () => {
    expect(themeWipeRadius(0, 0, 800, 600)).toBe(Math.hypot(800, 600) * THEME_WIPE_COVERAGE);
    expect(themeWipeRadius(400, 300, 800, 600)).toBe(Math.hypot(400, 300) * THEME_WIPE_COVERAGE);
  });

  it("themeWipeFrames 切浅色收回旧层、切深色展开新层，对侧钉满圆", () => {
    const origin = { x: 10, y: 20 };
    const toLight = themeWipeFrames(origin, 100, true);
    expect(toLight.movingPseudo).toBe("::view-transition-old(root)");
    expect(toLight.holdPseudo).toBe("::view-transition-new(root)");
    expect(toLight.moving[0]).toContain("100px");
    expect(toLight.moving[1]).toContain("0px");
    expect(toLight.hold).toEqual([toLight.moving[0], toLight.moving[0]]);

    const toDark = themeWipeFrames(origin, 100, false);
    expect(toDark.movingPseudo).toBe("::view-transition-new(root)");
    expect(toDark.holdPseudo).toBe("::view-transition-old(root)");
    expect(toDark.moving[0]).toContain("0px");
    expect(toDark.moving[1]).toContain("100px");
    expect(toDark.hold[0]).toBe(toDark.hold[1]);
  });

  it("themeTransitionOriginFromElement 用元素中心", () => {
    const el = document.createElement("button");
    el.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 40, height: 20, right: 50, bottom: 40, x: 10, y: 20, toJSON: () => undefined }) as DOMRect;
    expect(themeTransitionOriginFromElement(el)).toEqual({ x: 30, y: 30 });
  });

  it("测试环境跳过 View Transition，同步 apply", async () => {
    let applied = 0;
    await runThemeViewTransition(() => {
      applied += 1;
      setTheme("dark");
    }, { x: 0, y: 0 });
    expect(applied).toBe(1);
    expect(getTheme()).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme-transition")).toBeNull();
  });
});
