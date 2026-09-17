import { describe, expect, it } from "vitest";
import { resolveChromeSpec } from "./chrome-model";

describe("chrome-model", () => {
  it("缺省无 leading、无 drop", () => {
    expect(resolveChromeSpec({})).toEqual({
      showLeading: false,
      drop: undefined,
    });
  });

  it("hasLeading 与 dropIgnore 进规格", () => {
    expect(resolveChromeSpec({ hasLeading: true, dropIgnore: true })).toEqual({
      showLeading: true,
      drop: "ignore",
    });
  });

  it("规格没有 layout", () => {
    expect(resolveChromeSpec({ hasBar: true, hasExtra: true })).not.toHaveProperty("layout");
  });
});
