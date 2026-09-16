import { describe, expect, it } from "vitest";

import {
  COL_RESIZE_STEP,
  clampColWidth,
  colTrackTemplate,
  colWidthOf,
  defaultColWidths,
  nudgeColWidth,
  setColWidth,
  type ColResizePhase,
  type YoColSpec,
} from "./col-model";

const cols: YoColSpec[] = [
  { key: "ts", defaultWidth: 144, minWidth: 72 },
  { key: "pid", defaultWidth: 48, minWidth: 36 },
  { key: "msg", defaultWidth: 96, minWidth: 80, flex: true },
];

describe("col-model", () => {
  it("clamp 不低于 min、不超过 max", () => {
    const spec = { key: "tag", defaultWidth: 192, minWidth: 48, maxWidth: 240 };
    expect(clampColWidth(spec, 10)).toBe(48);
    expect(clampColWidth(spec, 300)).toBe(240);
    expect(clampColWidth(spec, 160)).toBe(160);
  });

  it("defaultColWidths 取 defaultWidth", () => {
    expect(defaultColWidths(cols)).toEqual({ ts: 144, pid: 48, msg: 96 });
  });

  it("setColWidth 写绝对 px；flex 列不动", () => {
    const widths = defaultColWidths(cols);
    expect(setColWidth(widths, cols[0]!, 160).ts).toBe(160);
    expect(setColWidth(widths, cols[0]!, 10).ts).toBe(72);
    expect(setColWidth(widths, cols[2]!, 200)).toBe(widths);
  });

  it("轨道：定宽 px，flex 为 minmax", () => {
    expect(colTrackTemplate(cols, defaultColWidths(cols))).toBe("144px 48px minmax(96px, 1fr)");
    expect(colTrackTemplate([cols[1]!, cols[2]!], { pid: 48, msg: 96 })).toBe("48px minmax(96px, 1fr)");
  });

  it("nudge 一步等于 Spacing.Sm", () => {
    const spec = cols[0]!;
    expect(COL_RESIZE_STEP).toBe(8);
    expect(nudgeColWidth(144, spec, 1)).toBe(152);
    expect(nudgeColWidth(72, spec, -1)).toBe(72);
    expect(colWidthOf(spec, {})).toBe(144);
  });

  it("列宽相位在 L2", () => {
    const phases: ColResizePhase[] = ["start", "move", "end"];
    expect(phases).toEqual(["start", "move", "end"]);
  });
});
