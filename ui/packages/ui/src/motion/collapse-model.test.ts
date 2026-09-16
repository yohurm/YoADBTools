import { describe, expect, it } from "vitest";

import { DEFAULT_COLLAPSE_RECIPE, resolveCollapseRows, resolveCollapseSpec } from "./collapse-model";
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
});
