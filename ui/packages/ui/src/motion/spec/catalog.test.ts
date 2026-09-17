import { describe, expect, it } from "vitest";

import { MotionSpec, type MotionSpecName } from "../../tokens/motion";
import { loadMotionCss } from "../css";
import { MotionCatalog, type MotionCatalogEntry } from "./catalog";

const REQUIRED_RECIPES = [
  "rail",
  "collapse",
  "panel",
  "fill",
  "preview",
  "inline-end",
  "send-aim",
  "swap",
  "travel",
  "grow",
  "list",
  "chip",
  "fade",
  "rise",
  "dialog",
  "toast",
  "popover",
  "indicator",
  "dismiss-fade",
  "theme-wipe",
  "tree-chevron",
  "reorder",
  "scroller",
] as const;

function catalogSpecs(spec: MotionCatalogEntry["spec"]): MotionSpecName[] {
  return typeof spec === "string" ? [spec] : [...spec];
}

/** data-recipe / 配方 class；theme-wipe 走 View Transition 选择器。 */
function recipeSelectors(name: string): readonly string[] {
  if (name === "theme-wipe") {
    return ["::view-transition", "data-theme-transition"];
  }
  return [`data-recipe="${name}"`, `.yohu-recipe-${name}`, `.yohu-${name}`];
}

describe("motion catalog", () => {
  it("catalog keys unique and cover the L3 recipe set", () => {
    const keys = Object.keys(MotionCatalog);
    const names = Object.values(MotionCatalog).map((entry) => entry.name);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(names).size).toBe(names.length);
    expect(keys.sort()).toEqual([...REQUIRED_RECIPES].sort());
    for (const [key, entry] of Object.entries(MotionCatalog)) {
      expect(entry.name).toBe(key);
    }
  });

  it("every spec name exists on MotionSpec", () => {
    for (const entry of Object.values(MotionCatalog)) {
      for (const spec of catalogSpecs(entry.spec)) {
        expect(MotionSpec).toHaveProperty(spec);
        expect(spec in MotionSpec).toBe(true);
      }
    }
  });

  it("loadMotionCss contains a recognizable selector for each recipe", () => {
    const css = loadMotionCss();
    expect(css.length).toBeGreaterThan(0);
    for (const name of Object.keys(MotionCatalog)) {
      const hit = recipeSelectors(name).some((token) => css.includes(token));
      expect(hit, `${name} missing data-recipe or class in motion CSS`).toBe(true);
    }
  });
});
