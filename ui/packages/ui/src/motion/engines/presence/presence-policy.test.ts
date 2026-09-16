import { describe, expect, it } from "vitest";

import { presenceHostRecipe } from "./presence-policy";

describe("presenceHostRecipe", () => {
  it("returns data-recipe attribute map", () => {
    expect(presenceHostRecipe("dialog")).toEqual({ "data-recipe": "dialog" });
    expect(presenceHostRecipe("list")).toEqual({ "data-recipe": "list" });
  });
});
