import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  COL_RESIZE_STEP,
  charsTrack,
  clampColWidth,
  colResizePhaseIsActive,
  colTrackTemplate,
  colWidthOf,
  defaultColWidths,
  nudgeColWidth,
  resolveColExtentPx,
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

  it("charsTrack 用探针 px，不用 CSS ch", () => {
    expect(charsTrack(24, 8)).toBe("192px");
    expect(charsTrack(4, 8.4)).toBe("34px");
    expect(charsTrack(6, 0)).toBe("6px");
  });

  it("列垫只写在列模型", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const name of ["col-model.ts", "ColFrame.tsx", "ColHeader.tsx"]) {
      let body = readFileSync(join(here, name), "utf8");
      if (name === "col-model.ts") body = body.replace('export type YoColCellPad = "list" | "none";', "");
      expect(body, name).not.toContain('"list" | "none"');
    }
  });

  it("未写列宽像素按 0，视图不再各自兜底", () => {
    expect(resolveColExtentPx()).toBe(0);
    expect(resolveColExtentPx(undefined)).toBe(0);
    expect(resolveColExtentPx(48)).toBe(48);
    const here = dirname(fileURLToPath(import.meta.url));
    for (const name of ["col-model.ts", "ColHeader.tsx", "ColResizer.tsx"]) {
      let body = readFileSync(join(here, name), "utf8");
      if (name === "col-model.ts") body = body.replace("return px ?? 0", "");
      expect(body, name).not.toContain("?? 0");
    }
  });

  it("列宽相位在 L2", () => {
    const phases: ColResizePhase[] = ["start", "move", "end"];
    expect(phases).toEqual(["start", "move", "end"]);
    expect(colResizePhaseIsActive("start")).toBe(true);
    expect(colResizePhaseIsActive("move")).toBe(true);
    expect(colResizePhaseIsActive("end")).toBe(false);
    const here = dirname(fileURLToPath(import.meta.url));
    for (const name of ["col-model.ts", "ColHeader.tsx", "ColResizer.tsx"]) {
      let body = readFileSync(join(here, name), "utf8");
      if (name === "col-model.ts") body = body.replace('return phase === "start" || phase === "move"', "");
      expect(body, name).not.toContain('phase === "start"');
      expect(body, name).not.toContain('phase === "move"');
      expect(body, name).not.toContain('phase === "end"');
    }
  });
});
