import { describe, expect, it } from "vitest";
import { resolveOpsFeatures } from "./ops-feature-model";

describe("ops-feature-model", () => {
  it("缺省五项都关", () => {
    expect(resolveOpsFeatures()).toEqual({
      select: false,
      multi: false,
      reorder: false,
      menu: false,
      rule: false,
    });
    expect(resolveOpsFeatures([])).toEqual(resolveOpsFeatures());
  });

  it("只接通声明过的功能", () => {
    expect(resolveOpsFeatures(["select", "reorder"])).toEqual({
      select: true,
      multi: false,
      reorder: true,
      menu: false,
      rule: false,
    });
  });

  it("multi 含单选，rule 与 menu 互不牵连", () => {
    expect(resolveOpsFeatures(["multi", "menu", "rule"])).toEqual({
      select: true,
      multi: true,
      reorder: false,
      menu: true,
      rule: true,
    });
  });
});
