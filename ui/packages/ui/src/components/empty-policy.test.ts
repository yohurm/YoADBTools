import { describe, expect, it } from "vitest";
import { emptyStateHostAttrs } from "./empty-policy";

describe("empty-policy", () => {
  it("默认不标插画与 action", () => {
    expect(emptyStateHostAttrs({ title: "空" })).toEqual({
      "data-has-icon": undefined,
      "data-has-action": undefined,
      "data-fill": undefined,
    });
  });

  it("有插画和 action 时写入 data-*", () => {
    expect(emptyStateHostAttrs({ title: "空", hasIcon: true, hasAction: true })).toEqual({
      "data-has-icon": true,
      "data-has-action": true,
      "data-fill": undefined,
    });
  });

  it("fill 写入 data-fill", () => {
    expect(emptyStateHostAttrs({ title: "空", fill: true })["data-fill"]).toBe(true);
  });
});
