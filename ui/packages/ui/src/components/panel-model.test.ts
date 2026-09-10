import { describe, expect, it } from "vitest";
import { defaultPanelPadding, resolvePanelSpec } from "./panel-model";

describe("panel-model", () => {
  it("缺省是 card + md", () => {
    expect(resolvePanelSpec({})).toEqual({ variant: "card", padding: "md" });
  });

  it("pane 默认 none 内边距", () => {
    expect(defaultPanelPadding("pane")).toBe("none");
    expect(resolvePanelSpec({ variant: "pane" })).toEqual({ variant: "pane", padding: "none" });
  });

  it("显式 padding 盖过变体缺省", () => {
    expect(resolvePanelSpec({ variant: "pane", padding: "sm" })).toEqual({
      variant: "pane",
      padding: "sm",
    });
    expect(resolvePanelSpec({ padding: "lg" })).toEqual({ variant: "card", padding: "lg" });
  });
});
