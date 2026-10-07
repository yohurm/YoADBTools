import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Radius } from "../tokens/radius";
import { Stroke } from "../tokens/layout";
import {
  CORNER_PAINT_VIEWBOX,
  clampCornerRadii,
  cornerExtentIsEmpty,
  cornerRadiusForRole,
  cornerEdgeHaloPath,
  cornerHaloOutset,
  cornerRadiiToUnit,
  cornerStrokeRingPath,
  cssCornerClip,
  cssCornerPath,
  insetCornerRadii,
  mergeCornerRadii,
  outsetCornerRadii,
  pointInRoundedRect,
  resolveCornerPaint,
  resolveCornerRadius,
  resolveCornerRole,
  roundedRectPath,
  roundedRectPathXY,
  uniformCornerRadii,
} from "./corner-model";
import {
  cornerMeasureTarget,
  cornerModeIsHost,
  cornerModeIsPaint,
  resolveCornerContentSpec,
  resolveCornerHostSpec,
} from "./corner-policy";

describe("corner-model", () => {
  it("PC 角色半径对照鸿蒙：控件 8、卡片/弹出框 16", () => {
    expect(cornerRadiusForRole("control")).toBe(Radius.Sm);
    expect(cornerRadiusForRole("card")).toBe(Radius.Md);
    expect(cornerRadiusForRole("dialog")).toBe(Radius.Md);
    expect(cornerRadiusForRole("dialog")).toBeGreaterThan(cornerRadiusForRole("control"));
  });

  it("邻接圆角超过边长时按同一系数缩小", () => {
    const clamped = clampCornerRadii(40, 40, uniformCornerRadii(30));
    expect(clamped.tl).toBeCloseTo(20);
    expect(clamped.tr).toBeCloseTo(20);
    expect(clamped.br).toBeCloseTo(20);
    expect(clamped.bl).toBeCloseTo(20);
  });

  it("描边 inset 半径不低于 0", () => {
    expect(insetCornerRadii(uniformCornerRadii(8), 1)).toEqual(uniformCornerRadii(7));
    expect(insetCornerRadii(uniformCornerRadii(1), 4)).toEqual(uniformCornerRadii(0));
  });

  it("四分之一圆路径含圆弧，直角退化为矩形", () => {
    const round = roundedRectPath(0, 0, 80, 40, uniformCornerRadii(8));
    expect(round.startsWith("M")).toBe(true);
    expect(round.endsWith("Z")).toBe(true);
    expect(round).toContain("A8 8 0 0 1");
    const square = roundedRectPath(0, 0, 80, 40, uniformCornerRadii(0));
    expect(square).not.toContain("A");
    expect(square).toContain("H80");
  });

  it("四角在圆外、边心在圆内（与启动表面 in_round_rect 同判定）", () => {
    const r = uniformCornerRadii(16);
    expect(pointInRoundedRect(0, 0, 480, 300, r)).toBe(false);
    expect(pointInRoundedRect(479, 0, 480, 300, r)).toBe(false);
    expect(pointInRoundedRect(0, 299, 480, 300, r)).toBe(false);
    expect(pointInRoundedRect(479, 299, 480, 300, r)).toBe(false);
    expect(pointInRoundedRect(16, 16, 480, 300, r)).toBe(true);
    expect(pointInRoundedRect(240, 150, 480, 300, r)).toBe(true);
  });

  it("外圈与 inset 描边对偶：中心线在盒外，不复用 fill", () => {
    expect(outsetCornerRadii(uniformCornerRadii(16), 5)).toEqual(uniformCornerRadii(21));
    expect(cornerHaloOutset(4, 2)).toBe(5);
    const radii = uniformCornerRadii(16);
    expect(cornerEdgeHaloPath(80, 40, radii, 0)).toBe("");
    const halo = cornerEdgeHaloPath(80, 40, radii, 5);
    const fill = roundedRectPath(0, 0, 80, 40, radii);
    expect(halo).not.toBe(fill);
    expect(halo).toContain("-5");
    const paint = resolveCornerPaint({
      width: 80,
      height: 40,
      role: "card",
      stroke: Stroke.Hairline,
      edgeOutset: 5,
    });
    expect(paint.edgePath).toMatch(/-0\.06/);
    expect(paint.edgePath).not.toBe(paint.fillPath);
    expect(paint.edgePath).not.toBe(paint.strokePath);
    expect(paint.edgePath).not.toBe(halo);
    expect(resolveCornerPaint({ width: 80, height: 40, role: "card" }).edgePath).toBe("");
  });

  it("描边环是外顺 + 内逆的 evenodd 洞", () => {
    const ring = cornerStrokeRingPath(80, 40, uniformCornerRadii(8), Stroke.Hairline);
    expect(ring.split("Z").length - 1).toBe(2);
    expect(ring).toContain("A8 8 0 0 1");
    expect(ring).toContain("A7 7 0 0 0");
  });

  it("resolveCornerPaint：无描边只填外径，有描边裁到内侧", () => {
    const fillOnly = resolveCornerPaint({ width: 80, height: 40, role: "control" });
    expect(fillOnly.radii.tl).toBe(Radius.Sm);
    expect(fillOnly.strokePath).toBe("");
    expect(fillOnly.viewBox).toBe(CORNER_PAINT_VIEWBOX);
    expect(fillOnly.fillPath).toContain("A0.1 0.2");
    expect(fillOnly.clipPath).toBe(cssCornerClip(0, fillOnly.radii));
    expect(fillOnly.clipPath.startsWith("inset(")).toBe(true);
    const stroked = resolveCornerPaint({
      width: 80,
      height: 40,
      role: "dialog",
      stroke: Stroke.Hairline,
    });
    expect(stroked.radii.tl).toBe(Radius.Md);
    expect(stroked.strokePath.length).toBeGreaterThan(0);
    expect(stroked.clipPath).toBe(cssCornerClip(Stroke.Hairline, stroked.radii));
    expect(stroked.clipPath).toContain("1px");
    expect(stroked.clipPath).not.toContain("path(");
  });

  it("绘制空间是单位方，量盒只换算半径，裁切跟 CSS 盒", () => {
    const paint = resolveCornerPaint({ width: 80, height: 40, role: "control", stroke: Stroke.Hairline });
    expect(paint.viewBox).toBe("0 0 1 1");
    const unit = cornerRadiiToUnit(80, 40, paint.radii);
    expect(unit.tlx).toBeCloseTo(0.1);
    expect(unit.tly).toBeCloseTo(0.2);
    expect(paint.fillPath).toBe(roundedRectPathXY(0, 0, 1, 1, unit));
    expect(cssCornerClip(Stroke.Hairline, paint.radii)).toMatch(/^inset\(/);
  });

  it("零盒不画路径", () => {
    const empty = resolveCornerPaint({ width: 0, height: 0, role: "card" });
    expect(empty.fillPath).toBe("");
    expect(empty.edgePath).toBe("");
    expect(empty.clipPath).toBe("none");
    expect(empty.viewBox).toBe(CORNER_PAINT_VIEWBOX);
  });

  it("单角覆盖仍走统一 clamp", () => {
    const merged = mergeCornerRadii(8, { tr: 0, bl: 0 });
    expect(merged).toEqual({ tl: 8, tr: 0, br: 8, bl: 0 });
    expect(cssCornerPath("M0 0H1Z")).toBe("path('M0 0H1Z')");
    expect(cssCornerPath("")).toBe("none");
  });
});

describe("corner-policy", () => {
  it("host 默认描边并裁切，paint 默认不描边", () => {
    const host = resolveCornerHostSpec({ role: "dialog" });
    expect(host.mode).toBe("host");
    expect(host.radius).toBe(Radius.Md);
    expect(host.stroke).toBe(Stroke.Hairline);
    expect(host.clip).toBe(true);
    const paint = resolveCornerHostSpec({ role: "control", mode: "paint" });
    expect(paint.stroke).toBe(0);
    expect(paint.clip).toBe(false);
    expect(paint.radius).toBe(Radius.Sm);
  });

  it("内容槽缺省 column / stretch / start / visible / none", () => {
    expect(resolveCornerContentSpec()).toEqual({
      direction: "column",
      align: "stretch",
      justify: "start",
      overflow: "visible",
      pad: "none",
      gap: "none",
    });
  });

  it("内容槽公开轴原样落下，未知值归一", () => {
    expect(
      resolveCornerContentSpec({
        direction: "row",
        align: "center",
        justify: "center",
        overflow: "auto",
        pad: "inline-sm",
        gap: "sm",
      }),
    ).toEqual({
      direction: "row",
      align: "center",
      justify: "center",
      overflow: "auto",
      pad: "inline-sm",
      gap: "sm",
    });
    expect(
      resolveCornerContentSpec({
        direction: "grid" as never,
        align: "end" as never,
        justify: "between" as never,
        overflow: "scroll" as never,
        pad: "lg" as never,
        gap: "xl" as never,
      }),
    ).toEqual(resolveCornerContentSpec());
  });

  it("缺省角色、缺省半径、空盒各判一次", () => {
    expect(resolveCornerRole(undefined)).toBe("card");
    expect(resolveCornerRole("control")).toBe("control");
    expect(resolveCornerRadius("card", undefined)).toBe(Radius.Md);
    expect(resolveCornerRadius("control", 3)).toBe(3);
    expect(cornerExtentIsEmpty(0, 8)).toBe(true);
    expect(cornerExtentIsEmpty(8, -1)).toBe(true);
    expect(cornerExtentIsEmpty(8, 8)).toBe(false);
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      "corner-model.ts",
      "corner-policy.ts",
      "Corner.tsx",
      "../list-frame/list-frame-model.ts",
      "../list-frame/ListFrame.tsx",
    ];
    for (const name of files) {
      let body = readFileSync(join(here, name), "utf8");
      if (name === "corner-model.ts") {
        body = body
          .replace("const DEFAULT_CORNER_ROLE: CornerRole = \"card\";", "")
          .replace("return role ?? DEFAULT_CORNER_ROLE", "")
          .replace("return radius ?? cornerRadiusForRole(role)", "")
          .replace("return width <= 0 || height <= 0", "");
      }
      expect(body, name).not.toContain("?? DEFAULT_CORNER_ROLE");
      expect(body, name).not.toContain("DEFAULT_CORNER_ROLE");
      expect(body, name).not.toContain("?? cornerRadiusForRole");
      expect(body, name).not.toContain("width <= 0 || height <= 0");
      expect(body, name).not.toContain("innerW <= 0 || innerH <= 0");
    }
  });

  it("paint 量父盒，host 量自己，只写一次", () => {
    const parent = document.createElement("div");
    const el = document.createElement("div");
    parent.append(el);
    expect(cornerMeasureTarget(el, "paint")).toBe(parent);
    expect(cornerMeasureTarget(el, "host")).toBe(el);
    expect(cornerMeasureTarget(el, undefined)).toBe(el);
    const here = dirname(fileURLToPath(import.meta.url));
    for (const name of ["corner-policy.ts", "Corner.tsx"]) {
      let body = readFileSync(join(here, name), "utf8");
      if (name === "corner-policy.ts") {
        body = body.replace("return cornerModeIsPaint(mode) ? el.parentElement : el", "");
      }
      expect(body, name).not.toContain("parentElement");
    }
  });

  it("host 与 paint 只各比一次", () => {
    expect(cornerModeIsHost("host")).toBe(true);
    expect(cornerModeIsHost("paint")).toBe(false);
    expect(cornerModeIsPaint("paint")).toBe(true);
    expect(cornerModeIsPaint("host")).toBe(false);
    const here = dirname(fileURLToPath(import.meta.url));
    for (const name of ["corner-policy.ts", "Corner.tsx"]) {
      let body = readFileSync(join(here, name), "utf8");
      if (name === "corner-policy.ts") {
        body = body.replace('return mode === "host"', "").replace('return mode === "paint"', "");
      }
      expect(body, name).not.toContain('=== "host"');
      expect(body, name).not.toContain('=== "paint"');
    }
  });
});

describe("可选长度", () => {
  it("没有就是 0，并且不小于 0，只判一次", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "corner-model.ts"), "utf8");
    const needle = "?? " + "0";
    expect(source.split(needle).length - 1).toBe(1);
    expect(source).toContain("nonNegative(input.stroke)");
    expect(source).toContain("nonNegative(input.edgeOutset)");
    expect(source).toContain("axisExtent(input.width)");
    expect(source).toContain("axisExtent(input.height)");
  });
});

describe("必填边长", () => {
  it("盒的一条边不小于 0，不写在 input 上", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "corner-model.ts"), "utf8");
    const needle = "Math.max(0, input.";
    expect(source.split(needle).length - 1).toBe(0);
    expect(source).toContain("return Math.max(0, value ?? 0)");
    expect(source).toContain("axisExtent(width)");
  });
});

describe("四角半径", () => {
  it("压到不小于 0 交给边长", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "corner-model.ts"), "utf8");
    for (const corner of ["tl", "tr", "br", "bl"]) {
      const clamped = "Math.max(0, radii." + corner + ");";
      expect(source.split(clamped).length - 1).toBe(0);
      expect(source).toContain("axisExtent(radii." + corner + ")");
    }
    expect(source).toContain("axisExtent(radii.tl - step)");
    expect(source).toContain("axisExtent(width)");
  });
});

describe("内缩半径", () => {
  it("四角减去步长后不小于 0 交给边长", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "corner-model.ts"), "utf8");
    for (const corner of ["tl", "tr", "br", "bl"]) {
      const oldNeedle = "Math.max(0, radii." + corner + " - step)";
      expect(source.split(oldNeedle).length - 1).toBe(0);
      expect(source).toContain("axisExtent(radii." + corner + " - step)");
    }
    expect(source).toContain("const r = Math.max(0, radius)");
    expect(source).toContain("axisExtent(width)");
    expect(source).toContain("return Math.max(0, value ?? 0)");
    expect(source).toContain("axisExtent(radii.tl)");
  });
});

describe("收缩盒边", () => {
  it("宽和高都交给边长", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "corner-model.ts"), "utf8");
    const widthNeedle = "Math.max(0, " + "width)";
    const heightNeedle = "Math.max(0, " + "height)";
    expect(source.split(widthNeedle).length - 1).toBe(0);
    expect(source.split(heightNeedle).length - 1).toBe(0);
    expect(source).toContain("axisExtent(width)");
    expect(source).toContain("axisExtent(height)");
    expect(source).toContain("axisExtent(input.width)");
    expect(source).toContain("axisExtent(input.height)");
    expect(source).toContain("const r = Math.max(0, radius)");
    expect(source).toContain("axisExtent(gap)");
    expect(source).toContain("axisExtent(inset)");
    expect(source).toContain("return Math.max(0, value ?? 0)");
    expect(source).toContain("return Math.max(0, value);");
  });
});

describe("外圈长度", () => {
  it("空隙和描边宽都交给边长", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "corner-model.ts"), "utf8");
    const gapNeedle = "Math.max(0, " + "gap)";
    const strokeNeedle = "Math.max(0, " + "strokeWidth)";
    expect(source.split(gapNeedle).length - 1).toBe(0);
    expect(source.split(strokeNeedle).length - 1).toBe(0);
    expect(source).toContain("axisExtent(gap)");
    expect(source).toContain("axisExtent(strokeWidth)");
    expect(source).toContain("axisExtent(inset)");
    expect(source).toContain("const r = Math.max(0, radius)");
    expect(source).toContain("return Math.max(0, value ?? 0)");
    expect(source).toContain("return Math.max(0, value);");
    expect(source).toContain(" / 2");
  });
});

describe("步长", () => {
  it("内缩外扩和内容裁切都交给边长", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "corner-model.ts"), "utf8");
    const insetNeedle = "Math.max(0, " + "inset)";
    const outsetNeedle = "Math.max(0, " + "outset)";
    expect(source.split(insetNeedle).length - 1).toBe(0);
    expect(source.split(outsetNeedle).length - 1).toBe(0);
    expect(source.split("axisExtent(inset)").length - 1).toBe(2);
    expect(source.split("axisExtent(outset)").length - 1).toBe(1);
    expect(source).toContain("const r = Math.max(0, radius)");
    expect(source).toContain("return Math.max(0, value ?? 0)");
    expect(source).toContain("return Math.max(0, value);");
    expect(source).toContain("axisExtent(strokeWidth) / 2");
  });
});
