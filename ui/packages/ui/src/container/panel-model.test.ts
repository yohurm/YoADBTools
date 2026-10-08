import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Spacing } from "../tokens/spacing";
import { Stroke } from "../tokens/layout";
import {
  defaultPanelOverflow,
  defaultPanelPadding,
  panelEdgeIsDrop,
  panelHotEdge,
  panelRoleIsOps,
  panelVariantIsCard,
  panelVariantIsPane,
  resolvePanelEdgeOutset,
  resolvePanelSpec,
  resolvePanelRole,
} from "./panel-model";
import { panelHeaderIsCardTitle, panelHeaderIsCustom, panelHeaderIsPane } from "./panel-policy";

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
      role: "surface",
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
      role: "surface",
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
      role: "surface",
    });
    expect(resolvePanelSpec({ padding: "lg" })).toEqual({
      variant: "card",
      padding: "lg",
      paddingBlock: null,
      align: "stretch",
      gap: "none",
      overflow: "visible",
      edge: "none",
      role: "surface",
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
      role: "surface",
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
      role: "surface",
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
      role: "surface",
    });
    expect(resolvePanelRole(undefined)).toBe("surface");
    expect(resolvePanelRole("ops")).toBe("ops");
    expect(resolvePanelSpec({ variant: "pane", role: "ops" }).role).toBe("ops");
  });

  it("变体、角色、外圈和顶栏只各比一次", () => {
    expect(panelVariantIsPane("pane")).toBe(true);
    expect(panelVariantIsPane("card")).toBe(false);
    expect(panelVariantIsCard("card")).toBe(true);
    expect(panelRoleIsOps("ops")).toBe(true);
    expect(panelRoleIsOps("surface")).toBe(false);
    expect(panelEdgeIsDrop("drop")).toBe(true);
    expect(panelEdgeIsDrop("none")).toBe(false);
    expect(panelHotEdge(true)).toBe("drop");
    expect(panelHotEdge(false)).toBe(undefined);
    expect(panelHeaderIsCustom("custom")).toBe(true);
    expect(panelHeaderIsPane("pane")).toBe(true);
    expect(panelHeaderIsCardTitle("card-title")).toBe(true);
    expect(panelHeaderIsCardTitle("card")).toBe(false);
    const here = dirname(fileURLToPath(import.meta.url));
    for (const name of ["panel-model.ts", "panel-policy.ts", "Panel.tsx"]) {
      let body = readFileSync(join(here, name), "utf8");
      if (name === "panel-model.ts") {
        body = body
          .replace('return variant === "pane"', "")
          .replace('return variant === "card"', "")
          .replace('return role === "ops"', "")
          .replace('return edge === "drop"', "")
          .replace('return hot ? "drop" : undefined', "");
      }
      if (name === "panel-policy.ts") {
        body = body
          .replace('return kind === "custom"', "")
          .replace('return kind === "pane"', "")
          .replace('return kind === "card-title"', "");
      }
      expect(body, name).not.toContain('=== "pane"');
      expect(body, name).not.toContain('=== "card"');
      expect(body, name).not.toContain('=== "ops"');
      expect(body, name).not.toContain('=== "drop"');
      expect(body, name).not.toContain('=== "custom"');
      expect(body, name).not.toContain('=== "card-title"');
      expect(body, name).not.toContain('!== "none"');
      expect(body, name).not.toContain("Show when={props.title}");
      expect(body, name).not.toContain("Show when={props.actions}");
      expect(body, name).not.toContain("Boolean(props.");
    }
  });
});
