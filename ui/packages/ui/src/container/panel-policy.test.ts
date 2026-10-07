import { describe, expect, it } from "vitest";
import { resolvePanelSpec } from "./panel-model";
import { panelHostAttrs, panelSlotOn, resolvePanelHeaderKind } from "./panel-policy";

describe("panel-policy", () => {
  it("顶栏槽空串与 false 不算有", () => {
    expect(panelSlotOn(undefined)).toBe(false);
    expect(panelSlotOn(null)).toBe(false);
    expect(panelSlotOn(false)).toBe(false);
    expect(panelSlotOn("")).toBe(false);
    expect(panelSlotOn("标题")).toBe(true);
  });

  it("缺省宿主是 card + md + 无顶栏 + 内容区默认", () => {
    expect(panelHostAttrs({})).toEqual({
      "data-variant": "card",
      "data-padding": "md",
      "data-header": "none",
      "data-align": "stretch",
      "data-gap": "none",
      "data-overflow": "visible",
    });
  });

  it("自定义 header 盖过 title/actions", () => {
    expect(
      resolvePanelHeaderKind(resolvePanelSpec({ variant: "pane" }), {
        header: true,
        title: true,
        actions: true,
      }),
    ).toBe("custom");
  });

  it("pane 才画标题行与操作", () => {
    expect(
      resolvePanelHeaderKind(resolvePanelSpec({ variant: "pane" }), { title: true }),
    ).toBe("pane");
    expect(
      resolvePanelHeaderKind(resolvePanelSpec({ variant: "pane" }), { actions: true }),
    ).toBe("pane");
  });

  it("card 只画标题，不因 actions 出顶栏", () => {
    expect(
      resolvePanelHeaderKind(resolvePanelSpec({}), { title: true, actions: true }),
    ).toBe("card-title");
    expect(resolvePanelHeaderKind(resolvePanelSpec({}), { actions: true })).toBe("none");
  });

  it("pane 缺省 padding 是 none，宿主只写 data-*", () => {
    expect(panelHostAttrs({ variant: "pane" })).toEqual({
      "data-variant": "pane",
      "data-padding": "none",
      "data-header": "none",
      "data-align": "stretch",
      "data-gap": "none",
      "data-overflow": "hidden",
    });
  });

  it("内容区排布写成 data-*，永不写 data-overflow-x", () => {
    expect(
      panelHostAttrs({
        variant: "pane",
        align: "center",
        gap: "2xs",
        paddingBlock: "xs",
      }),
    ).toEqual({
      "data-variant": "pane",
      "data-padding": "none",
      "data-header": "none",
      "data-align": "center",
      "data-gap": "2xs",
      "data-overflow": "hidden",
      "data-padding-block": "xs",
    });
    expect(panelHostAttrs({ overflow: "visible" })).not.toHaveProperty("data-overflow-x");
    expect(panelHostAttrs({ overflow: "hidden" })).not.toHaveProperty("data-overflow-x");
  });

  it("overflow hidden 两轴同一 data-overflow", () => {
    expect(panelHostAttrs({ variant: "pane", overflow: "hidden" })).toEqual({
      "data-variant": "pane",
      "data-padding": "none",
      "data-header": "none",
      "data-align": "stretch",
      "data-gap": "none",
      "data-overflow": "hidden",
    });
  });

  it("edge 仅 drop 才写 data-edge", () => {
    expect(panelHostAttrs({}).hasOwnProperty("data-edge")).toBe(false);
    expect(panelHostAttrs({ edge: "drop" })["data-edge"]).toBe("drop");
  });

  it("操作面板才写 data-role", () => {
    expect(panelHostAttrs({})).not.toHaveProperty("data-role");
    expect(panelHostAttrs({ variant: "pane", role: "ops" })["data-role"]).toBe("ops");
  });
});
