import { describe, expect, it } from "vitest";

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Density, controlRowHeight, setDensity } from "@yohu/ui";

import { importDialogSize } from "./layout";

function loadLayout(): string {
  const candidates = [
    resolve(process.cwd(), "src/layout.ts"),
    resolve(process.cwd(), "packages/modules/terminal/src/layout.ts"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate, "utf-8");
  }
  return "";
}

describe("terminal layout", () => {
  it("清单行高跟当前密度，终端不再自备一份", () => {
    const src = loadLayout();
    expect(src).not.toContain("function controlRowHeight");
    expect(src).not.toContain("Density.Comfortable.controlHeight");
    setDensity("compact");
    const compact = importDialogSize();
    expect(controlRowHeight()).toBe(Density.Compact.controlHeight);
    setDensity("comfortable");
    const comfortable = importDialogSize();
    expect(controlRowHeight()).toBe(Density.Comfortable.controlHeight);
    expect(comfortable.width).toBe(compact.width);
    const rowDelta = Density.Comfortable.controlHeight - Density.Compact.controlHeight;
    expect(comfortable.height - compact.height).toBe(rowDelta * 11);
  });
});
