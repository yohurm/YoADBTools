import { describe, expect, it } from "vitest";
import { defaultPanelOverflow, defaultPanelPadding, resolvePanelSpec } from "./panel-model";

describe("panel-model", () => {
  it("缺省是 card + md，内容区 stretch / 无间隙 / visible", () => {
    expect(resolvePanelSpec({})).toEqual({
      variant: "card",
      padding: "md",
      paddingBlock: null,
      align: "stretch",
      gap: "none",
      overflow: "visible",
      overflowX: "visible",
    });
  });

  it("pane 默认 none 内边距、overflow auto", () => {
    expect(defaultPanelPadding("pane")).toBe("none");
    expect(defaultPanelOverflow("pane")).toBe("auto");
    expect(resolvePanelSpec({ variant: "pane" })).toEqual({
      variant: "pane",
      padding: "none",
      paddingBlock: null,
      align: "stretch",
      gap: "none",
      overflow: "auto",
      overflowX: "auto",
    });
  });

  it("显式 padding 盖过变体缺省", () => {
    expect(resolvePanelSpec({ variant: "pane", padding: "sm" })).toEqual({
      variant: "pane",
      padding: "sm",
      paddingBlock: null,
      align: "stretch",
      gap: "none",
      overflow: "auto",
      overflowX: "auto",
    });
    expect(resolvePanelSpec({ padding: "lg" })).toEqual({
      variant: "card",
      padding: "lg",
      paddingBlock: null,
      align: "stretch",
      gap: "none",
      overflow: "visible",
      overflowX: "visible",
    });
  });

  it("内容区排布显式值写入规格", () => {
    expect(
      resolvePanelSpec({
        variant: "pane",
        align: "center",
        gap: "2xs",
        paddingBlock: "xs",
        overflowX: "hidden",
      }),
    ).toEqual({
      variant: "pane",
      padding: "none",
      paddingBlock: "xs",
      align: "center",
      gap: "2xs",
      overflow: "auto",
      overflowX: "hidden",
    });
  });

  it("overflow hidden 两轴一同裁切", () => {
    expect(resolvePanelSpec({ variant: "pane", overflow: "hidden" })).toEqual({
      variant: "pane",
      padding: "none",
      paddingBlock: null,
      align: "stretch",
      gap: "none",
      overflow: "hidden",
      overflowX: "hidden",
    });
  });
});
