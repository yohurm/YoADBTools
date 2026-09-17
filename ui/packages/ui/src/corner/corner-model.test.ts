import { describe, expect, it } from "vitest";
import { Radius } from "../tokens/radius";
import { Stroke } from "../tokens/layout";
import {
  clampCornerRadii,
  cornerRadiusForRole,
  cornerEdgeHaloPath,
  cornerHaloOutset,
  cornerStrokeRingPath,
  cssCornerPath,
  insetCornerRadii,
  mergeCornerRadii,
  outsetCornerRadii,
  pointInRoundedRect,
  resolveCornerPaint,
  roundedRectPath,
  uniformCornerRadii,
} from "./corner-model";
import { resolveCornerContentSpec, resolveCornerHostSpec } from "./corner-policy";

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
    expect(paint.edgePath).toBe(halo);
    expect(paint.edgePath).not.toBe(paint.fillPath);
    expect(paint.edgePath).not.toBe(paint.strokePath);
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
    expect(fillOnly.clipPath).toContain("path('M");
    const stroked = resolveCornerPaint({
      width: 80,
      height: 40,
      role: "dialog",
      stroke: Stroke.Hairline,
    });
    expect(stroked.radii.tl).toBe(Radius.Md);
    expect(stroked.strokePath.length).toBeGreaterThan(0);
    expect(stroked.clipPath).toContain("M16 1");
    expect(stroked.clipPath).not.toBe(`path('${stroked.fillPath}')`);
  });

  it("零盒不画路径", () => {
    const empty = resolveCornerPaint({ width: 0, height: 0, role: "card" });
    expect(empty.fillPath).toBe("");
    expect(empty.edgePath).toBe("");
    expect(empty.clipPath).toBe("none");
    expect(empty.viewBox).toBe("0 0 1 1");
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
});
