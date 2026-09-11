import { describe, expect, it } from "vitest";
import { resolveEmptyStateSpec } from "./empty-model";

describe("empty-model", () => {
  it("只要标题时没有插画 / 描述 / action / fill", () => {
    expect(resolveEmptyStateSpec({ title: "空" })).toEqual({
      title: "空",
      description: undefined,
      hasIcon: false,
      hasAction: false,
      fill: false,
    });
  });

  it("空字符串描述视为没有描述", () => {
    expect(resolveEmptyStateSpec({ title: "空", description: "" }).description).toBeUndefined();
  });

  it("插画与 action 是独立开关", () => {
    expect(
      resolveEmptyStateSpec({ title: "空", description: "说明", hasIcon: true, hasAction: true }),
    ).toEqual({
      title: "空",
      description: "说明",
      hasIcon: true,
      hasAction: true,
      fill: false,
    });
  });

  it("fill 是独立开关", () => {
    expect(resolveEmptyStateSpec({ title: "空", fill: true }).fill).toBe(true);
  });
});
