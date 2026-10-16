import { describe, expect, it } from "vitest";

import { loadMotionLayerCss } from "../../css";
import {
  COLLAPSE_INTERPOLATE_RECIPES,
  DEFAULT_COLLAPSE_AXIS,
  DEFAULT_COLLAPSE_RECIPE,
  collapseDelaysPaint,
  collapsePaintOpen,
  collapseTripProperty,
  resolveCollapseAxis,
  resolveCollapseSpec,
  resolveCollapseTrack,
  resolveCollapseTripOnToggle,
  resolveCollapseTripSpec,
} from "./collapse-model";
import { collapseHostAttrs } from "./collapse-policy";

describe("collapse-model / policy", () => {
  it("缺省 collapse + block，open 是布尔", () => {
    expect(resolveCollapseSpec({})).toEqual({
      open: false,
      recipe: DEFAULT_COLLAPSE_RECIPE,
      axis: DEFAULT_COLLAPSE_AXIS,
    });
    expect(resolveCollapseSpec({ open: true, recipe: "panel" })).toEqual({
      open: true,
      recipe: "panel",
      axis: "block",
    });
    expect(resolveCollapseSpec({ open: true, axis: "inline" })).toEqual({
      open: true,
      recipe: "collapse",
      axis: "inline",
    });
  });

  it("写成 data-open / data-recipe / data-axis", () => {
    expect(collapseHostAttrs({ open: false })).toEqual({
      "data-open": "false",
      "data-recipe": "collapse",
      "data-axis": "block",
    });
    expect(collapseHostAttrs({ open: true, recipe: "fill" })).toEqual({
      "data-open": "true",
      "data-recipe": "fill",
      "data-axis": "block",
    });
    expect(collapseHostAttrs({ open: true, axis: "inline" })["data-axis"]).toBe("inline");
    expect(collapseHostAttrs({ open: true })["data-flex"]).toBeUndefined();
    expect(collapseHostAttrs({ open: true, flex: "grow" })["data-flex"]).toBe("grow");
    expect(collapseHostAttrs({ open: true, flex: "hug" })["data-flex"]).toBe("hug");
  });

  it("轴只换被插值的那根轨道名", () => {
    expect(resolveCollapseAxis()).toBe("block");
    expect(resolveCollapseAxis("inline")).toBe("inline");
    expect(resolveCollapseTrack(false)).toBe("0fr");
    expect(resolveCollapseTrack(true)).toBe("1fr");
    expect(collapseTripProperty()).toBe("grid-template-rows");
    expect(collapseTripProperty("block")).toBe("grid-template-rows");
    expect(collapseTripProperty("inline")).toBe("grid-template-columns");
  });

  it("行程 spec 跟轴与配方，减动效不当行程", () => {
    expect(resolveCollapseTripSpec()).toBe("spatialLocal");
    expect(resolveCollapseTripSpec("fill")).toBe("spatialLocal");
    expect(resolveCollapseTripSpec("panel")).toBe("spatialStretch");
    expect(resolveCollapseTripSpec("panel", "inline")).toBe("spatialPanel");
    expect(resolveCollapseTripSpec("collapse", "inline")).toBe("spatialPanel");
    expect(resolveCollapseTripOnToggle(false)).toBe(true);
    expect(resolveCollapseTripOnToggle(true)).toBe(false);
  });

  it("内容身高出生先关，fill 与减动效直接跟意图", () => {
    expect(collapseDelaysPaint(undefined, false)).toBe(true);
    expect(collapseDelaysPaint("panel", false)).toBe(true);
    expect(collapseDelaysPaint("fill", false)).toBe(false);
    expect(collapseDelaysPaint("collapse", true)).toBe(false);
    expect(collapsePaintOpen(true, true, false)).toBe(false);
    expect(collapsePaintOpen(true, true, true)).toBe(true);
    expect(collapsePaintOpen(true, false, false)).toBe(true);
    expect(collapsePaintOpen(false, true, true)).toBe(false);
  });

  it("collapse/panel/fill 插值，hug 不是 recipe", () => {
    expect(COLLAPSE_INTERPOLATE_RECIPES).toEqual(["collapse", "panel", "fill"]);
    expect(DEFAULT_COLLAPSE_RECIPE).toBe("collapse");
    expect((COLLAPSE_INTERPOLATE_RECIPES as readonly string[]).includes("hug")).toBe(false);
  });

  it("fill 不给 inner > * 写 min-height:min-content", () => {
    const css = loadMotionLayerCss("engines/collapse/collapse.css");
    const fill = css.slice(css.indexOf("配方 fill"));
    expect(fill.length).toBeGreaterThan(0);
    expect(fill).not.toMatch(/\.yohu-collapse__inner\s*>\s*\*[^{]*\{[^}]*min-height:\s*min-content/);
    expect(fill).not.toContain(".yohu-collapse__content > *");
    expect(fill).not.toContain("min-height: min-content");
  });

  it("inline 轴换列向轨道，行向让位，窗格贴 inline-end", () => {
    const css = loadMotionLayerCss("engines/collapse/collapse.css");
    const inline = css.slice(css.indexOf("轴 inline"));
    expect(inline.length).toBeGreaterThan(0);
    expect(inline).toContain('grid-template-columns: 0fr');
    expect(inline).toContain('grid-template-columns: 1fr');
    expect(inline).toContain("grid-template-columns var(--yohu-motion-spatial-panel)");
    expect(inline).not.toContain("grid-template-rows var(--yohu-motion-spatial-panel)");
    // 行向不让位，高度会跟宽度一起塌。
    expect(inline).toMatch(
      /\.yohu-collapse\[data-axis="inline"\]\s*\{[^}]*grid-template-rows:\s*1fr/,
    );
    expect(inline).toContain('justify-content: flex-end');
    // `__inner` 是块容器，`__content` 吃不到 stretch；少了这笔侧栏窗格只抱住内容高。
    expect(inline).toMatch(
      /\.yohu-collapse\[data-axis="inline"\] \.yohu-collapse__content\s*\{[^}]*height:\s*100%/,
    );
    expect(inline).toContain("translateX(var(--yohu-space-sm))");
    expect(inline).not.toContain("display: none");
    // inline 段必须压在 block panel 之后，否则那根 transition 抢回来。
    expect(css.indexOf("轴 inline")).toBeGreaterThan(css.indexOf('data-recipe="panel"'));
  });
});
