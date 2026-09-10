import { describe, expect, it } from "vitest";
import { resolvePanelSpec } from "./panel-model";
import { panelHostAttrs, resolvePanelHeaderKind } from "./panel-policy";

describe("panel-policy", () => {
  it("缺省宿主是 card + md + 无顶栏", () => {
    expect(panelHostAttrs({})).toEqual({
      "data-variant": "card",
      "data-padding": "md",
      "data-header": "none",
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
    });
  });
});
