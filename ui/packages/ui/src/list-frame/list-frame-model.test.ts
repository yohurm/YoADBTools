import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Stroke } from "../tokens/layout";
import { listFrameBox, listFrameInset, listFrameStroke } from "./list-frame-model";

describe("list-frame-model", () => {
  it("缩进 Accent，描边 Hairline", () => {
    expect(listFrameInset()).toBe(Stroke.Accent);
    expect(listFrameStroke()).toBe(Stroke.Hairline);
  });

  it("行盒内缩后得到叠加层盒", () => {
    expect(listFrameBox({ x: 0, y: 66, width: 400, height: 28 })).toEqual({
      x: Stroke.Accent,
      y: 66 + Stroke.Accent,
      width: 400 - Stroke.Accent * 2,
      height: 28 - Stroke.Accent * 2,
    });
  });

  it("视图不再自判缺省 variant", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    for (const name of ["ListFrame.tsx", "list-frame-policy.ts", "list-frame-model.ts"]) {
      const body = readFileSync(join(root, name), "utf8");
      expect(body, name).not.toContain('?? "hot"');
      expect(body, name).not.toContain("width <= 0 || height <= 0");
    }
  });

  it("面积不够则不画", () => {
    expect(listFrameBox({ x: 0, y: 0, width: 2, height: 28 })).toBeNull();
    expect(listFrameBox({ x: 0, y: 0, width: 400, height: 0 })).toBeNull();
  });
});
