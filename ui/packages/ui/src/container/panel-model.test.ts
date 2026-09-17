import { describe, expect, it } from "vitest";
import { Spacing } from "../tokens/spacing";
import { Stroke } from "../tokens/layout";
import {
  defaultPanelOverflow,
  defaultPanelPadding,
  resolvePanelEdgeOutset,
  resolvePanelSpec,
} from "./panel-model";

describe("panel-model", () => {
  it("缺省是 card + md，内容区 stretch / 无间隙 / visible", () => {
    expect(resolvePanelSpec({})).toEqual({
      variant: "card",
      padding: "md",
      paddingBlock: null,
      align: "stretch",
      gap: "none",
      overflow: "visible",
      edge: "none",
    });
  });

  it("pane 默认 none 内边距、overflow hidden", () => {
    expect(defaultPanelPadding("pane")).toBe("none");
    expect(defaultPanelOverflow("pane")).toBe("hidden");
    expect(resolvePanelSpec({ variant: "pane" })).toEqual({
      variant: "pane",
      padding: "none",
      paddingBlock: null,
      align: "stretch",
      gap: "none",
      overflow: "hidden",
      edge: "none",
    });
  });

  it("显式 padding 盖过变体缺省", () => {
    expect(resolvePanelSpec({ variant: "pane", padding: "sm" })).toEqual({
      variant: "pane",
      padding: "sm",
      paddingBlock: null,
      align: "stretch",
      gap: "none",
      overflow: "hidden",
      edge: "none",
    });
    expect(resolvePanelSpec({ padding: "lg" })).toEqual({
      variant: "card",
      padding: "lg",
      paddingBlock: null,
      align: "stretch",
      gap: "none",
      overflow: "visible",
      edge: "none",
    });
  });

  it("内容区排布显式值写入规格", () => {
    expect(
      resolvePanelSpec({
        variant: "pane",
        align: "center",
        gap: "2xs",
        paddingBlock: "xs",
      }),
    ).toEqual({
      variant: "pane",
      padding: "none",
      paddingBlock: "xs",
      align: "center",
      gap: "2xs",
      overflow: "hidden",
      edge: "none",
    });
  });

  it("overflow 两轴同一值，规格没有 overflowX", () => {
    expect(resolvePanelSpec({ variant: "pane", overflow: "hidden" })).toEqual({
      variant: "pane",
      padding: "none",
      paddingBlock: null,
      align: "stretch",
      gap: "none",
      overflow: "hidden",
      edge: "none",
    });
    expect(resolvePanelSpec({})).not.toHaveProperty("overflowX");
    expect(resolvePanelSpec({ overflow: "visible" })).not.toHaveProperty("overflowX");
  });

  it("edge drop 写入规格，缺省 none", () => {
    expect(resolvePanelEdgeOutset("none")).toBe(0);
    expect(resolvePanelEdgeOutset("drop")).toBe(Spacing.Xs + Stroke.Accent / 2);
    expect(resolvePanelSpec({ edge: "drop" }).edge).toBe("drop");
    expect(resolvePanelSpec({ variant: "pane", edge: "drop" })).toEqual({
      variant: "pane",
      padding: "none",
      paddingBlock: null,
      align: "stretch",
      gap: "none",
      overflow: "hidden",
      edge: "drop",
    });
  });
});
