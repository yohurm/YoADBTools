import { describe, expect, it } from "vitest";

import { loadMotionLayerCss } from "../../css";
import {
  COLLAPSE_INTERPOLATE_RECIPES,
  COLLAPSE_TRIP_PROPERTY,
  DEFAULT_COLLAPSE_RECIPE,
  resolveCollapseRows,
  resolveCollapseSpec,
  resolveCollapseTripOnToggle,
  resolveCollapseTripSpec,
} from "./collapse-model";
import { collapseHostAttrs } from "./collapse-policy";

describe("collapse-model / policy", () => {
  it("缺省 collapse，open 是布尔", () => {
    expect(resolveCollapseSpec({})).toEqual({ open: false, recipe: DEFAULT_COLLAPSE_RECIPE });
    expect(resolveCollapseSpec({ open: true, recipe: "panel" })).toEqual({
      open: true,
      recipe: "panel",
    });
  });

  it("写成 data-open / data-recipe", () => {
    expect(collapseHostAttrs({ open: false })).toEqual({
      "data-open": "false",
      "data-recipe": "collapse",
    });
    expect(collapseHostAttrs({ open: true, recipe: "fill" })).toEqual({
      "data-open": "true",
      "data-recipe": "fill",
    });
  });

  it("行高只认 open", () => {
    expect(resolveCollapseRows(false)).toBe("0fr");
    expect(resolveCollapseRows(true)).toBe("1fr");
  });

  it("行程 spec 跟配方，减动效不当行程", () => {
    expect(COLLAPSE_TRIP_PROPERTY).toBe("grid-template-rows");
    expect(resolveCollapseTripSpec()).toBe("spatialLocal");
    expect(resolveCollapseTripSpec("fill")).toBe("spatialLocal");
    expect(resolveCollapseTripSpec("panel")).toBe("spatialStretch");
    expect(resolveCollapseTripOnToggle(false)).toBe(true);
    expect(resolveCollapseTripOnToggle(true)).toBe(false);
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
    expect(fill).not.toContain("min-height: min-content");
  });
});
