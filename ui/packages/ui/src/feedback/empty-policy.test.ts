import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { emptyStateDescription, emptyStateHostAttrs } from "./empty-policy";

describe("empty-policy", () => {
  it("默认不标插画与 action", () => {
    expect(emptyStateHostAttrs({ title: "空" })).toEqual({
      "data-has-icon": undefined,
      "data-has-action": undefined,
      "data-fill": undefined,
      "data-size": undefined,
    });
  });

  it("有插画和 action 时写入 data-*", () => {
    expect(emptyStateHostAttrs({ title: "空", hasIcon: true, hasAction: true })).toEqual({
      "data-has-icon": "",
      "data-has-action": "",
      "data-fill": undefined,
      "data-size": undefined,
    });
  });

  it("fill 写入 data-fill", () => {
    expect(emptyStateHostAttrs({ title: "空", fill: true })["data-fill"]).toBe("");
  });

  it("size=sm 写入 data-size", () => {
    expect(emptyStateHostAttrs({ title: "空", size: "sm" })["data-size"]).toBe("sm");
  });

  it("描述空串不占槽，视图不再看原始 prop", () => {
    expect(emptyStateDescription({ title: "空", description: "" })).toBeUndefined();
    expect(emptyStateDescription({ title: "空", description: "说明" })).toBe("说明");
    const view = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "EmptyState.tsx"), "utf8");
    expect(view).not.toContain("Show when={props.description}");
    expect(view).not.toContain("Show when={props.icon}");
  });
});
