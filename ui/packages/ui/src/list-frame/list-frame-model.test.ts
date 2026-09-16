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

  it("面积不够则不画", () => {
    expect(listFrameBox({ x: 0, y: 0, width: 2, height: 28 })).toBeNull();
    expect(listFrameBox({ x: 0, y: 0, width: 400, height: 0 })).toBeNull();
  });
});
