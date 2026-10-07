import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadMotionLayerCss } from "../../css";
import { getTheme, setTheme } from "../../../tokens";
import {
  nextResolvedTheme,
  runThemeViewTransition,
  themeTransitionOriginFromElement,
  themeWipeFrames,
  themeWipeRadius,
  THEME_WIPE_COVERAGE,
} from "./index";

function loadFile(rel: string): string {
  const candidates = [
    resolve(process.cwd(), rel),
    resolve(process.cwd(), `packages/ui/${rel}`),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

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

  it("时长只走 spatialEnter，不另建时长表", () => {
    const src = loadFile("src/motion/engines/theme/theme-transition.ts");
    expect(src).toContain('motionSpecMs("spatialEnter")');
    expect(src).toContain("startViewTransition");
    expect(src).not.toMatch(/THEME_\w*DURATION/);
    expect(src).not.toContain("Record<");
    const css = loadMotionLayerCss("engines/theme/theme-wipe.css");
    expect(css).toContain("::view-transition");
    expect(css).toContain("animation-duration: var(--yohu-dur-enter)");
    expect(css).not.toMatch(/\b\d+ms\b/);
  });
});

describe("擦除较远边", () => {
  it("横轴和纵轴都取点到该轴两端较远的一段", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "theme-transition.ts"), "utf8");
    expect(src.split("Math.max(x, " + "width - x)").length - 1).toBe(0);
    expect(src.split("Math.max(y, " + "height - y)").length - 1).toBe(0);
    expect(src).toContain("themeFarEdge(x, width)");
    expect(src).toContain("themeFarEdge(y, height)");
    expect(src.split("function themeFarEdge").length - 1).toBe(1);
    expect(src.split("return Math.max(point, span - point)").length - 1).toBe(1);
    expect(src).toContain("THEME_WIPE_COVERAGE");
    expect(src).toContain("themeAxisCenter(box.left, box.width)");
  });
});

describe("揭示轴中心", () => {
  it("横轴和纵轴都是起点加上边长的一半", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "theme-transition.ts"), "utf8");
    expect(src.split("box.left + " + "box.width / 2").length - 1).toBe(0);
    expect(src.split("box.top + " + "box.height / 2").length - 1).toBe(0);
    expect(src).toContain("themeAxisCenter(box.left, box.width)");
    expect(src).toContain("themeAxisCenter(box.top, box.height)");
    expect(src.split("function themeAxisCenter").length - 1).toBe(1);
    expect(src.split("return origin + size / 2").length - 1).toBe(1);
    expect(src).toContain("function themeFarEdge");
    expect(src).toContain("themeFarEdge(x, width)");
  });
});

describe("擦除圆心", () => {
  it("收缩圆和展开圆都钉在同一原点", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "theme-transition.ts"), "utf8");
    expect(src.split("${origin.x}px " + "${origin.y}px").length - 1).toBe(0);
    expect(src).toContain("themeWipeAt(origin.x, origin.y)");
    expect(src.split("themeWipeAt(origin.x, origin.y)").length - 1).toBe(2);
    expect(src.split("function themeWipeAt").length - 1).toBe(1);
    expect(src.split("return `${" + "x}px ${y}px`").length - 1).toBe(1);
    expect(src).toContain("function themeAxisCenter");
    expect(src).toContain("themeFarEdge(x, width)");
  });
});

describe("擦除对侧", () => {
  it("切浅色和切深色都把对侧两帧钉在展开圆", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "theme-transition.ts"), "utf8");
    expect(src.split("[expanded, " + "expanded]").length - 1).toBe(0);
    expect(src).toContain("themeWipeHold(expanded)");
    expect(src.split("themeWipeHold(expanded)").length - 1).toBe(2);
    expect(src.split("function themeWipeHold").length - 1).toBe(1);
    expect(src.split("return [" + "frame, frame]").length - 1).toBe(1);
    expect(src).toContain("function themeWipeAt");
    expect(src).toContain("themeWipeAt(origin.x, origin.y)");
  });
});

describe("擦除同拍", () => {
  it("移动层和对侧层都经同一函数播 clip", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "theme-transition.ts"), "utf8");
    expect(src.split("clipPath: frames." + "moving").length - 1).toBe(0);
    expect(src.split("clipPath: frames." + "hold").length - 1).toBe(0);
    expect(src.split("pseudoElement: frames." + "movingPseudo").length - 1).toBe(0);
    expect(src.split("pseudoElement: frames." + "holdPseudo").length - 1).toBe(0);
    expect(src.split("root.animate(").length - 1).toBe(1);
    expect(src).toContain("themeWipeClip(root, frames.moving, frames.movingPseudo, common)");
    expect(src).toContain("themeWipeClip(root, frames.hold, frames.holdPseudo, common)");
    expect(src.split("function themeWipeClip").length - 1).toBe(1);
    expect(src).toContain("function themeWipeHold");
    expect(src).toContain("themeWipeHold(expanded)");
  });
});

describe("擦除收尾", () => {
  it("finished 拒绝经 themeSettled 吞掉", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "theme-transition.ts"), "utf8");
    expect(src.split(".finished.catch(" + "() => undefined)").length - 1).toBe(0);
    expect(src).toContain("themeSettled(moving.finished)");
    expect(src).toContain("themeSettled(transition.finished)");
    expect(src.split("function themeSettled").length - 1).toBe(1);
    expect(src.split("return done.catch(" + "() => undefined)").length - 1).toBe(1);
    expect(src).toContain("function themeWipeClip");
    expect(src).toContain("themeWipeClip(root, frames.moving, frames.movingPseudo, common)");
    expect(src.split("waitFrames(1)").length - 1).toBe(1);
  });

  it("先松开伪元素 clip，再卸 View Transition 叠层", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "theme-transition.ts"), "utf8");
    const body = src.slice(src.indexOf("export async function runThemeViewTransition"));
    const releaseAt = body.indexOf("releaseThemeWipe(wipe)");
    const endAt = body.indexOf("endThemeTransition(transition)");
    expect(releaseAt).toBeGreaterThan(0);
    expect(endAt).toBeGreaterThan(releaseAt);
    expect(src.split("function releaseThemeWipe").length - 1).toBe(1);
    expect(src.split("anim.cancel()").length - 1).toBe(1);
    expect(src.split("function endThemeTransition").length - 1).toBe(1);
    expect(src.split("skip" + "Transition").length - 1).toBe(2);
  });
});

describe("擦除层名", () => {
  it("旧层和新层伪元素名只写在 themeViewLayer", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "theme-transition.ts"), "utf8");
    expect(src.split("::view-transition-" + "old(root)").length - 1).toBe(1);
    expect(src.split("::view-transition-" + "new(root)").length - 1).toBe(1);
    expect(src.split('themeViewLayer("old")').length - 1).toBe(2);
    expect(src.split('themeViewLayer("new")').length - 1).toBe(2);
    expect(src.split("function themeViewLayer").length - 1).toBe(1);
    expect(src).toContain("function themeSettled");
    expect(src).toContain("themeSettled(moving.finished)");
  });
});

describe("擦除圆句", () => {
  it("收缩圆和展开圆都经 themeCircle 写出", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "theme-transition.ts"), "utf8");
    expect(src.split("circle(0px at ${" + "themeWipeAt").length - 1).toBe(0);
    expect(src.split("circle(${radius}px at ${" + "themeWipeAt").length - 1).toBe(0);
    expect(src).toContain("themeCircle(0, themeWipeAt(origin.x, origin.y))");
    expect(src).toContain("themeCircle(radius, themeWipeAt(origin.x, origin.y))");
    expect(src.split("function themeCircle").length - 1).toBe(1);
    expect(src.split("return `circle(${" + "radius}px at ${at})`").length - 1).toBe(1);
    expect(src).toContain("function themeViewLayer");
    expect(src).toContain('themeViewLayer("old")');
    expect(src.split("themeWipeAt(origin.x, origin.y)").length - 1).toBe(2);
  });
});
